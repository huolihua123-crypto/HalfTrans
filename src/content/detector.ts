/**
 * 段落检测器
 * 扫描当前视口中可见的、未翻译的纯英文段落
 * 同时提供 MutationObserver 监听 DOM 变化以发现新增段落
 */

// 目标翻译元素的 CSS 选择器：段落、标题、列表项、表格单元格、引用、图注
const TRANSLATABLE_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption';
// 自定义属性：标记元素的唯一 ID
const ATTR_ID = 'data-halftrans-id';
// 自定义属性：标记元素已被处理（值为 'done' 或 'error'）
const ATTR_DONE = 'data-halftrans';

let idCounter = 0;

/** 为元素分配或获取已有的 halftrans ID */
function getOrAssignId(el: Element): string {
  let id = el.getAttribute(ATTR_ID);
  if (!id) {
    id = `ht-${idCounter++}`;
    el.setAttribute(ATTR_ID, id);
  }
  return id;
}

/** 检测当前视口内所有未翻译的纯英文段落，返回其 ID、文本和 DOM 元素 */
export function detectVisibleParagraphs(): Array<{ id: string; text: string; element: Element }> {
  const elements = document.querySelectorAll(TRANSLATABLE_SELECTORS);
  const results: Array<{ id: string; text: string; element: Element }> = [];

  for (const el of elements) {
    if (el.getAttribute(ATTR_DONE)) continue;
    if (el.querySelector(TRANSLATABLE_SELECTORS)) continue;
    const text = getOwnText(el);
    if (text.length === 0) continue;
    if (!isFullyEnglish(text)) continue;
    if (!isInViewport(el)) continue;

    results.push({ id: getOrAssignId(el), text, element: el });
  }

  return results;
}

/**
 * 提取元素自身的文本内容（排除子翻译结果和嵌套段落）
 * 使用 TreeWalker 而非 innerText，因为 innerText 会包含已注入的翻译文本
 */
function getOwnText(el: Element): string {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // 排除已注入的翻译结果和加载指示器
      if (parent.hasAttribute('data-halftrans-result') || parent.hasAttribute('data-halftrans-loading')) {
        return NodeFilter.FILTER_REJECT;
      }
      // 排除嵌套的可翻译元素（它们会被单独处理）
      if (parent !== el && parent.matches(TRANSLATABLE_SELECTORS)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const parts: string[] = [];
  while (walker.nextNode()) {
    const value = walker.currentNode.textContent?.trim();
    if (value) parts.push(value);
  }
  return parts.join(' ');
}

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

/** 判断文本是否为纯英文（不含中日韩字符），含 CJK 字符的段落跳过不翻译 */
function isFullyEnglish(text: string): boolean {
  const letters = text.replace(/\s/g, '');
  if (letters.length === 0) return false;
  // 匹配 CJK 统一汉字基本区 (U+4E00-9FFF) 和扩展 A 区 (U+3400-4DBF)
  return !/[一-鿿㐀-䶿]/.test(text);
}

/** 监听 DOM 变化（新增节点、文本变化、属性变化），触发回调重新检测段落 */
export function observeNewParagraphs(callback: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some(
      (m) =>
        m.addedNodes.length > 0 ||
        m.type === 'characterData' ||
        m.type === 'attributes'
    );
    if (relevant) callback();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-expanded'],
  });

  return observer;
}
