/**
 * Prompt 构建器
 * 构造发送给 LLM 的 system prompt 和 user prompt
 * 核心设计：system prompt 定义翻译规则和术语，user prompt 用 XML 标签分隔上下文和待翻译文本
 */

import type { TranslationStyle, TranslationContext } from '@shared/types';
import { getStrongTermsList } from './strong-terms';

/** 构建 system prompt：包含翻译硬规则、强保留术语、用户词库、风格指令和输出格式 */
export function buildSystemPrompt(
  style: TranslationStyle,
  keepTerms: string[],
  translateTerms: string[]
): string {
  const styleText = style === 'colloquial'
    ? '口语化，自然流畅，像同事之间交流'
    : '书面化，正式专业，适合文档阅读';

  const strongTerms = getStrongTermsList();

  // 用户词库优先级高于强保留术语表，单独成段以示强调
  let userDict = '';
  if (keepTerms.length > 0 || translateTerms.length > 0) {
    userDict = '\n\n=== USER DICTIONARY ===';
    if (keepTerms.length > 0) {
      userDict += `\n始终保留英文：${keepTerms.join(', ')}`;
    }
    if (translateTerms.length > 0) {
      userDict += `\n始终翻译为中文：${translateTerms.join(', ')}`;
    }
    userDict += '\n（用户词库优先级高于其他规则）';
  }

  return `你是程序员认知翻译助手。目标不是语言翻译，而是将英文技术内容转换为程序员最容易理解的表达形式。

=== HARD RULES ===
- 代码标识符（变量名、函数名、类名、包名、命令）永不翻译
- 代码块、日志内容、配置文件内容保持原样
- API 字段（userId, createdAt 等）保持原样
- 固定搭配保持整体：HTTP request, Pull Request, Dependency Injection

=== STRONG TERMS ===
以下术语在技术语境中通常保留英文原文：
${strongTerms}
（如果上下文表明某词不是作为技术概念使用，仍可翻译）

=== GUIDANCE ===
- 优先理解语义，禁止逐词翻译
- 普通技术词默认翻译为中文（如 server, request, response 等有明确中文对应的词）
- 同一概念全文保持一致
- 输出长度 ≤ 原文 1.3 倍，禁止扩展解释
- 翻译风格：${styleText}

=== FORMAT ===
- <context>标签内是参考上下文，帮你理解语境，不要翻译或输出它
- <translate>标签内是需要翻译的文本
- 只输出翻译结果，不要输出标签、编号、上下文或任何额外内容
- 批量翻译时，每段翻译之间用 [SEP] 分隔${userDict}`;
}

/** 构建单条翻译的 user prompt：用 <context> 包裹上下文，<translate> 包裹待翻译文本 */
export function buildUserPrompt(text: string, context: TranslationContext): string {
  const sections: string[] = [];

  const contextParts: string[] = [];
  if (context.pageContext) contextParts.push(context.pageContext);
  if (context.sectionContext) contextParts.push(`Section: ${context.sectionContext}`);
  if (context.surroundingText) contextParts.push(context.surroundingText);
  if (context.codeContext) contextParts.push(`Nearby code: ${context.codeContext}`);

  if (contextParts.length > 0) {
    sections.push(`<context>\n${contextParts.join('\n')}\n</context>`);
  }

  sections.push(`<translate>\n${text}\n</translate>`);

  return sections.join('\n\n');
}

/** 构建批量翻译的 user prompt：多段文本用 [SEP] 分隔，共享同一份上下文 */
export function buildBatchUserPrompt(texts: string[], context: TranslationContext): string {
  const sections: string[] = [];

  const contextParts: string[] = [];
  if (context.pageContext) contextParts.push(context.pageContext);
  if (context.sectionContext) contextParts.push(`Section: ${context.sectionContext}`);
  if (context.surroundingText) contextParts.push(context.surroundingText);
  if (context.codeContext) contextParts.push(`Nearby code: ${context.codeContext}`);

  if (contextParts.length > 0) {
    sections.push(`<context>\n${contextParts.join('\n')}\n</context>`);
  }

  const joined = texts.join('\n[SEP]\n');
  sections.push(`<translate>\n${joined}\n</translate>`);

  return sections.join('\n\n');
}
