/**
 * 翻译上下文构建器
 * 收集页面标题、章节标题、前后文段落、邻近代码块等上下文信息
 * 这些上下文帮助 LLM 理解语境，提高翻译准确性（尤其是多义词和术语判断）
 */

import type { TranslationContext } from '@shared/types';

const MAX_HEADINGS = 8;           // 页面级上下文最多收集的标题数
const MAX_SURROUNDING = 2;        // 前后文各取的段落数
const MAX_CODE_LENGTH = 300;      // 邻近代码块截取的最大字符数
const MAX_PARAGRAPH_LENGTH = 200; // 单段前后文截取的最大字符数

let cachedPageContext: string | null = null;

/** 收集页面级上下文：标题 + 前几个 h1/h2/h3 组成的导航路径。结果被缓存，同页面只查询一次 */
export function collectPageContext(): string {
  if (cachedPageContext !== null) return cachedPageContext;

  const parts: string[] = [];

  const title = document.title.trim();
  if (title) parts.push(`Title: ${title}`);

  const headings = document.querySelectorAll('h1, h2, h3');
  const headingTexts: string[] = [];
  for (const el of headings) {
    if (headingTexts.length >= MAX_HEADINGS) break;
    const text = el.textContent?.trim();
    if (text) headingTexts.push(text);
  }
  if (headingTexts.length > 0) {
    parts.push(headingTexts.join(' > '));
  }

  cachedPageContext = parts.join('\n');
  return cachedPageContext;
}

/** 清除页面上下文缓存（整页翻译开始时调用，因为用户可能在 SPA 中导航到新页面） */
export function resetPageContextCache(): void {
  cachedPageContext = null;
}

/** 收集单个段落的局部上下文：所属章节标题、前后文段落、邻近代码块 */
export function collectParagraphContext(element: Element): Omit<TranslationContext, 'pageContext'> {
  return {
    sectionContext: findSectionHeading(element),
    surroundingText: findSurroundingText(element),
    codeContext: findNearestCode(element),
  };
}

/** 构建单个元素的完整翻译上下文（页面级 + 段落级） */
export function buildFullContext(element: Element): TranslationContext {
  const paragraphCtx = collectParagraphContext(element);
  return {
    pageContext: collectPageContext(),
    ...paragraphCtx,
  };
}

/** 构建批量翻译的共享上下文：取首元素的章节标题，首尾元素范围内的前后文 */
export function buildBatchContext(elements: Element[]): TranslationContext {
  if (elements.length === 0) {
    return { pageContext: collectPageContext(), sectionContext: '', surroundingText: '', codeContext: '' };
  }

  const first = elements[0];
  const last = elements[elements.length - 1];

  const sectionContext = findSectionHeading(first);
  const codeContext = findNearestCodeForBatch(elements);
  const surroundingText = findBatchSurroundingText(first, last);

  return {
    pageContext: collectPageContext(),
    sectionContext,
    surroundingText,
    codeContext,
  };
}

/** 获取元素的纯文本（移除已注入的翻译结果节点后再取 textContent） */
function getCleanText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[data-halftrans-result], [data-halftrans-loading]').forEach((n) => n.remove());
  return clone.textContent?.trim() ?? '';
}

/** 向上查找最近的 h1-h3 标题作为章节上下文 */
function findSectionHeading(element: Element): string {
  let current: Element | null = element;
  while (current) {
    const prev: Element | null = current.previousElementSibling;
    if (prev && /^H[1-3]$/i.test(prev.tagName)) {
      return prev.textContent?.trim() ?? '';
    }
    current = prev;
  }

  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const heading = parent.querySelector('h1, h2, h3');
    if (heading) {
      const headingRect = heading.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      if (headingRect.top < elementRect.top) {
        return heading.textContent?.trim() ?? '';
      }
    }
    parent = parent.parentElement;
  }

  return '';
}

/** 查找目标元素前后各 MAX_SURROUNDING 段的文本作为语境 */
function findSurroundingText(element: Element): string {
  const paragraphs = Array.from(document.querySelectorAll('p, li'));
  const idx = paragraphs.indexOf(element);
  if (idx === -1) return '';

  const texts: string[] = [];

  for (let i = Math.max(0, idx - MAX_SURROUNDING); i < idx; i++) {
    const text = getCleanText(paragraphs[i]);
    if (text) texts.push(`[前文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  for (let i = idx + 1; i <= Math.min(paragraphs.length - 1, idx + MAX_SURROUNDING); i++) {
    const text = getCleanText(paragraphs[i]);
    if (text) texts.push(`[后文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  return texts.join('\n');
}

/** 查找批量翻译首尾元素范围外的前后文 */
function findBatchSurroundingText(first: Element, last: Element): string {
  const paragraphs = Array.from(document.querySelectorAll('p, li'));
  const firstIdx = paragraphs.indexOf(first);
  const lastIdx = paragraphs.indexOf(last);
  if (firstIdx === -1) return '';

  const texts: string[] = [];

  for (let i = Math.max(0, firstIdx - MAX_SURROUNDING); i < firstIdx; i++) {
    const text = getCleanText(paragraphs[i]);
    if (text) texts.push(`[前文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  const endIdx = lastIdx === -1 ? firstIdx : lastIdx;
  for (let i = endIdx + 1; i <= Math.min(paragraphs.length - 1, endIdx + MAX_SURROUNDING); i++) {
    const text = getCleanText(paragraphs[i]);
    if (text) texts.push(`[后文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  return texts.join('\n');
}

/** 查找目标元素附近的 <pre> 代码块（向上找 5 个兄弟，向下找 3 个兄弟） */
function findNearestCode(element: Element): string {
  let current: Element | null = element;
  for (let i = 0; i < 5 && current; i++) {
    const prev: Element | null = current.previousElementSibling;
    if (prev) {
      const code = prev.tagName === 'PRE' ? prev : prev.querySelector('pre');
      if (code) {
        const text = code.textContent?.trim() ?? '';
        return text.slice(0, MAX_CODE_LENGTH);
      }
    }
    current = prev;
  }

  current = element;
  for (let i = 0; i < 3 && current; i++) {
    const next: Element | null = current.nextElementSibling;
    if (next) {
      const code = next.tagName === 'PRE' ? next : next.querySelector('pre');
      if (code) {
        const text = code.textContent?.trim() ?? '';
        return text.slice(0, MAX_CODE_LENGTH);
      }
    }
    current = next;
  }

  return '';
}

/** 在批量元素中查找第一个有邻近代码块的元素，返回其代码上下文 */
function findNearestCodeForBatch(elements: Element[]): string {
  for (const el of elements) {
    const code = findNearestCode(el);
    if (code) return code;
  }
  return '';
}
