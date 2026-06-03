import type { TranslationProvider } from './provider';
import type { TranslationRequest, TranslationResult, BatchTranslationRequest, BatchTranslationResult } from '@shared/types';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from './prompt';

export class DirectAPIProvider implements TranslationProvider {
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, paragraphId, apiBaseUrl, apiKey, model, style, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(style, keepTerms, translateTerms);
    const userPrompt = buildUserPrompt(text, context);

    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
    const { paragraphs, apiBaseUrl, apiKey, model, style, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(style, keepTerms, translateTerms);
    const userPrompt = buildBatchUserPrompt(paragraphs.map((p) => p.text), context);

    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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

    if (parsed.length === paragraphs.length) {
      return {
        results: paragraphs.map((p, i) => ({
          paragraphId: p.id,
          original: p.text,
          translated: parsed[i],
        })),
      };
    }

    const results = await Promise.all(
      paragraphs.map((p) =>
        this.translate({ text: p.text, paragraphId: p.id, apiBaseUrl, apiKey, model, style, context, keepTerms, translateTerms })
      )
    );
    return { results };
  }

  private parseBatchResponse(content: string, expectedCount: number): string[] {
    const parts = content.split(/\[SEP\]/i).map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === expectedCount) {
      return parts;
    }
    const byNewlines = content.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (byNewlines.length === expectedCount) {
      return byNewlines;
    }
    return [];
  }
}
