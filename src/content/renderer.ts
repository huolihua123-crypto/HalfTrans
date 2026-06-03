/**
 * 翻译结果渲染器
 * 负责将翻译结果注入 DOM、显示加载状态和错误状态
 * 通过 data-halftrans-* 属性系统管理元素状态，避免重复渲染
 */

/** 将翻译结果注入到原始段落下方，如已存在则更新文本内容 */
export function renderTranslation(paragraphId: string, translatedText: string): void {
  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  if (!original) return;

  let resultEl = document.querySelector(`[data-halftrans-result="${paragraphId}"]`);

  if (resultEl) {
    const textSpan = resultEl.querySelector('.halftrans-text');
    if (textSpan) textSpan.textContent = translatedText;
  } else {
    resultEl = document.createElement('span');
    resultEl.setAttribute('data-halftrans-result', paragraphId);
    resultEl.className = 'halftrans-result';

    const textSpan = document.createElement('span');
    textSpan.className = 'halftrans-text';
    textSpan.textContent = translatedText;

    resultEl.appendChild(textSpan);
    original.appendChild(resultEl);
  }

  original.setAttribute('data-halftrans', 'done');
  removeLoading(paragraphId);
}

/** 在段落末尾显示"翻译中..."加载指示器 */
export function renderLoading(paragraphId: string): void {
  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  if (!original) return;
  if (document.querySelector(`[data-halftrans-loading="${paragraphId}"]`)) return;

  const loader = document.createElement('span');
  loader.setAttribute('data-halftrans-loading', paragraphId);
  loader.className = 'halftrans-loading';
  loader.textContent = '翻译中...';
  original.appendChild(loader);
}

/** 显示翻译错误信息和重试按钮 */
export function renderError(paragraphId: string, error: string): void {
  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  if (!original) return;

  removeLoading(paragraphId);

  const existingEl = document.querySelector(`[data-halftrans-result="${paragraphId}"]`);
  if (existingEl) {
    const textSpan = existingEl.querySelector('.halftrans-text');
    if (textSpan) textSpan.textContent = `翻译失败：${error}`;
  } else {
    const errorEl = document.createElement('span');
    errorEl.setAttribute('data-halftrans-result', paragraphId);
    errorEl.className = 'halftrans-result halftrans-error';

    const textSpan = document.createElement('span');
    textSpan.className = 'halftrans-text';
    textSpan.textContent = `翻译失败：${error}`;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'halftrans-close';
    retryBtn.textContent = '↻';
    retryBtn.title = '重试';

    errorEl.appendChild(textSpan);
    errorEl.appendChild(retryBtn);
    original.appendChild(errorEl);
  }

  original.setAttribute('data-halftrans', 'error');
}

/** 移除指定段落的翻译结果，恢复原始状态 */
export function removeTranslation(paragraphId: string): void {
  const resultEl = document.querySelector(`[data-halftrans-result="${paragraphId}"]`);
  resultEl?.remove();

  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  original?.removeAttribute('data-halftrans');
}

function removeLoading(paragraphId: string): void {
  const loader = document.querySelector(`[data-halftrans-loading="${paragraphId}"]`);
  loader?.remove();
}

/** 切换所有翻译结果的显示/隐藏状态，返回是否有结果被处理 */
export function toggleAllTranslations(): boolean {
  const results = document.querySelectorAll('[data-halftrans-result]');
  if (results.length === 0) return false;

  const firstResult = results[0] as HTMLElement;
  const isHidden = firstResult.style.display === 'none';

  results.forEach((el) => {
    (el as HTMLElement).style.display = isHidden ? '' : 'none';
  });

  return true;
}

/** 标记段落为已处理但不显示翻译（翻译结果与原文相同时使用） */
export function markSkipped(paragraphId: string): void {
  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  if (!original) return;

  const loader = document.querySelector(`[data-halftrans-loading="${paragraphId}"]`);
  loader?.remove();

  original.setAttribute('data-halftrans', 'done');
}
