/**
 * 选区翻译浮动按钮
 * 当用户选中文本时，在选区上方显示一个"译"按钮
 * 点击后触发选区翻译，结果通过 selection-popup 展示
 */

let floatBtn: HTMLElement | null = null;
let currentCallback: ((text: string) => void) | null = null;

/** 初始化浮动按钮：注册 selectionchange 监听器 */
export function initFloatingButton(onTranslate: (text: string) => void): void {
  currentCallback = onTranslate;
  document.addEventListener('selectionchange', handleSelectionChange);
}

/** 销毁浮动按钮：移除监听器和 DOM 元素 */
export function destroyFloatingButton(): void {
  document.removeEventListener('selectionchange', handleSelectionChange);
  removeButton();
  currentCallback = null;
}

/** 选区变化时判断是否显示按钮（无选中文本则移除） */
function handleSelectionChange(): void {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';

  if (text.length === 0) {
    removeButton();
    return;
  }

  showButton(selection!);
}

/** 在选区上方创建并定位浮动按钮 */
function showButton(selection: Selection): void {
  removeButton();

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  floatBtn = document.createElement('button');
  floatBtn.className = 'halftrans-float-btn';
  floatBtn.textContent = '译';
  floatBtn.style.cssText = `
    position: fixed;
    top: ${rect.top - 32}px;
    left: ${rect.left + rect.width / 2 - 14}px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid #4f9cf8;
    background: #fff;
    color: #4f9cf8;
    font-size: 12px;
    cursor: pointer;
    // z-index 设为最大值确保按钮不被页面任何元素遮挡
    z-index: 2147483647;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  `;

  // 使用 mousedown 而非 click，因为 click 会导致选区先消失再触发事件
  floatBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();   // 阻止默认行为以保持选区
    e.stopPropagation();  // 阻止冒泡避免触发页面其他监听
    const selectedText = window.getSelection()?.toString().trim() ?? '';
    if (selectedText && currentCallback) {
      currentCallback(selectedText);
    }
    removeButton();
  });

  document.body.appendChild(floatBtn);
}

function removeButton(): void {
  floatBtn?.remove();
  floatBtn = null;
}
