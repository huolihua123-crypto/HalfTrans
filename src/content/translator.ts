/**
 * 翻译编排器
 * 协调翻译请求的发送和结果处理，管理待处理队列
 * 区分两种翻译模式：页面批量翻译（translateParagraphs）和选区翻译（translateSelection）
 */

import { sendToBackground } from '@shared/messaging';
import { renderLoading, renderTranslation, renderError, markSkipped } from './renderer';
import { showSelectionPopup, showSelectionPopupLoading } from './selection-popup';
import { buildBatchContext, collectPageContext } from './context-builder';
import type { TranslationContext } from '@shared/types';

export class TranslationOrchestrator {
  // 待处理队列：paragraphId → 原始文本，用于去重和结果比对
  private pending = new Map<string, string>();
  // 选区翻译的 ID 集合，用于区分结果回调时走弹窗还是 DOM 注入
  private selectionIds = new Set<string>();
  private selectionCounter = 0;

  /** 批量翻译页面段落：去重 → 显示加载态 → 收集上下文 → 发送至 background */
  translateParagraphs(paragraphs: Array<{ id: string; text: string; element: Element }>): void {
    // 过滤已在队列中的段落，避免重复请求
    const newParagraphs = paragraphs.filter((p) => !this.pending.has(p.id));
    if (newParagraphs.length === 0) return;

    for (const p of newParagraphs) {
      this.pending.set(p.id, p.text);
      renderLoading(p.id);
    }

    const context = buildBatchContext(newParagraphs.map((p) => p.element));

    sendToBackground({
      type: 'TRANSLATE_PARAGRAPHS',
      payload: {
        paragraphs: newParagraphs.map(({ id, text }) => ({ id, text })),
        context,
      },
    }).catch((err) => {
      for (const p of newParagraphs) {
        this.handleError(p.id, (err as Error).message || '发送翻译请求失败');
      }
    });
  }

  /** 选区翻译：立即弹出加载态弹窗，生成临时 ID，收集页面上下文后发送 */
  translateSelection(text: string): void {
    showSelectionPopupLoading();
    const id = `sel-${this.selectionCounter++}`;
    this.selectionIds.add(id);
    const context: TranslationContext = {
      pageContext: collectPageContext(),
      sectionContext: '',
      surroundingText: '',
      codeContext: '',
    };

    sendToBackground({
      type: 'TRANSLATE_SELECTION',
      payload: { text, id, context },
    }).catch(() => {});
  }

  /** 处理翻译结果：选区翻译走弹窗，页面翻译走 DOM 注入；翻译结果与原文相同时标记跳过 */
  handleResult(paragraphId: string, translated: string): void {
    // 选区翻译（含浮动按钮、右键菜单）的结果通过弹窗展示
    if (this.selectionIds.has(paragraphId)) {
      this.selectionIds.delete(paragraphId);
      if (translated) {
        showSelectionPopup(translated);
      }
      return;
    }

    const original = this.pending.get(paragraphId) ?? '';
    this.pending.delete(paragraphId);
    // 翻译结果与原文相同说明该段无需翻译（如纯代码段），标记跳过
    if (!translated || translated.trim() === original.trim()) {
      markSkipped(paragraphId);
      return;
    }
    renderTranslation(paragraphId, translated);
  }

  handleError(paragraphId: string, error: string): void {
    if (this.selectionIds.has(paragraphId)) {
      this.selectionIds.delete(paragraphId);
      showSelectionPopup(`翻译失败：${error}`);
      return;
    }

    this.pending.delete(paragraphId);
    renderError(paragraphId, error);
  }
}
