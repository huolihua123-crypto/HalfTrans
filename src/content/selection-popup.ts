/**
 * 选区翻译结果弹窗
 * 在选区附近显示翻译结果，支持点击外部关闭
 * 当无法获取选区位置时（如右键菜单翻译），退化为屏幕居中展示
 */

let popup: HTMLElement | null = null;

/** 在选区下方显示翻译结果弹窗，无选区时居中显示 */
export function showSelectionPopup(text: string): void {
  removeSelectionPopup();

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    showAtCenter(text);
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  popup = document.createElement('div');
  popup.className = 'halftrans-sel-popup';
  popup.textContent = text;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'halftrans-sel-popup-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', removeSelectionPopup);
  popup.appendChild(closeBtn);

  document.body.appendChild(popup);

  const popupRect = popup.getBoundingClientRect();
  // 弹窗默认显示在选区正下方，超出视口底部时翻转到选区上方
  let top = rect.bottom + 6;
  let left = rect.left + rect.width / 2 - popupRect.width / 2;

  if (top + popupRect.height > window.innerHeight) {
    top = rect.top - popupRect.height - 6;
  }
  // 确保弹窗不超出视口左右边界
  if (left < 4) left = 4;
  if (left + popupRect.width > window.innerWidth - 4) {
    left = window.innerWidth - popupRect.width - 4;
  }

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  document.addEventListener('mousedown', handleOutsideClick);
}

/** 无法定位选区时的退化方案：在屏幕正中显示弹窗 */
function showAtCenter(text: string): void {
  popup = document.createElement('div');
  popup.className = 'halftrans-sel-popup';
  popup.textContent = text;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'halftrans-sel-popup-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', removeSelectionPopup);
  popup.appendChild(closeBtn);

  document.body.appendChild(popup);

  const popupRect = popup.getBoundingClientRect();
  popup.style.top = `${window.innerHeight / 2 - popupRect.height / 2}px`;
  popup.style.left = `${window.innerWidth / 2 - popupRect.width / 2}px`;

  document.addEventListener('mousedown', handleOutsideClick);
}

/** 点击弹窗外部时关闭弹窗 */
function handleOutsideClick(e: MouseEvent): void {
  if (popup && !popup.contains(e.target as Node)) {
    removeSelectionPopup();
  }
}

/** 移除弹窗并清理事件监听 */
function removeSelectionPopup(): void {
  popup?.remove();
  popup = null;
  document.removeEventListener('mousedown', handleOutsideClick);
}
