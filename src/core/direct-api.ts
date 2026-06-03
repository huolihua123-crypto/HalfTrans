/**
 * 直连 API 翻译提供者
 * 通过 OpenAI 兼容的 /chat/completions 接口调用 LLM 完成翻译
 * 支持单条翻译和批量翻译，批量翻译失败时自动降级为逐条翻译
 */

import type { TranslationProvider } from './provider';
import type { TranslationRequest, TranslationResult, BatchTranslationRequest, BatchTranslationResult } from '@shared/types';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from './prompt';

export class DirectAPIProvider implements TranslationProvider {
  /** 单条翻译：构造 prompt → 调用 API → 返回翻译结果 */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, paragraphId, settings, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(settings.style, keepTerms, translateTerms);
    const userPrompt = buildUserPrompt(text, context);

    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const translated = data.choices[0].message.content.trim();

    return { paragraphId, original: text, translated };
  }

  /** 批量翻译：将多段文本合并为一次 API 调用，解析失败时降级为逐条翻译 */
  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
    const { paragraphs, settings, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(settings.style, keepTerms, translateTerms);
    const userPrompt = buildBatchUserPrompt(paragraphs.map((p) => p.text), context);

    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const parsed = this.parseBatchResponse(content, paragraphs.length);

    // 批量解析成功：将结果按顺序映射回各段落
    if (parsed.length === paragraphs.length) {
      return {
        results: paragraphs.map((p, i) => ({
          paragraphId: p.id,
          original: p.text,
          translated: parsed[i],
        })),
      };
    }

    // 批量解析失败：降级为逐条翻译，牺牲性能换取正确性
    const results = await Promise.all(
      paragraphs.map((p) =>
        this.translate({ text: p.text, paragraphId: p.id, settings, context, keepTerms, translateTerms })
      )
    );
    return { results };
  }

  /**
   * 解析批量翻译响应：尝试按 [SEP] 分割，数量不匹配时 fallback 到双换行分割
   * 两种策略都失败则返回空数组，触发调用方降级为逐条翻译
   */
  private parseBatchResponse(content: string, expectedCount: number): string[] {
    // 优先策略：按 [SEP] 标记分割（prompt 中要求 LLM 用此标记分隔各段翻译）
    const parts = content.split(/\[SEP\]/i).map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === expectedCount) {
      return parts;
    }
    // 降级策略：部分 LLM 会忽略 [SEP] 指令，改用双换行分隔段落
    const byNewlines = content.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (byNewlines.length === expectedCount) {
      return byNewlines;
    }
    // 两种策略都无法正确分割，返回空数组让调用方降级为逐条翻译
    return [];
  }
}
