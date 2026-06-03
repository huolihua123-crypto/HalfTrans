/**
 * Content Script 入口
 * 协调检测→翻译→渲染的主流程，处理用户触发和自动发现
 * 监听 background 消息（翻译结果/错误/触发指令）并分发给对应模块
 */

import { onMessage } from '@shared/messaging';
import { detectVisibleParagraphs, observeNewParagraphs } from './detector';
import { resetPageContextCache } from './context-builder';
import { initFloatingButton } from './floating-btn';
import { toggleAllTranslations } from './renderer';
import { TranslationOrchestrator } from './translator';
import type { MessageType } from '@shared/types';
import './styles/content.css';

const orchestrator = new TranslationOrchestrator();
let pageTranslateActive = false;   // 是否已激活整页翻译
let translationsVisible = false;   // 翻译结果当前是否可见（用于 toggle）

/** 扫描视口内段落并送入翻译队列 */
function translateVisibleParagraphs(): void {
  const paragraphs = detectVisibleParagraphs();
  if (paragraphs.length > 0) {
    orchestrator.translateParagraphs(paragraphs);
  }
}

/** 处理整页翻译触发：首次调用启动翻译，再次调用切换显示/隐藏 */
function handlePageTranslate(): void {
  if (pageTranslateActive) {
    // 已激活时再次触发 = 切换翻译结果的可见性
    translationsVisible = !translationsVisible;
    toggleAllTranslations();
    return;
  }

  pageTranslateActive = true;
  translationsVisible = true;
  resetPageContextCache();

  translateVisibleParagraphs();

  // 滚动时延迟 200ms 后检测新进入视口的段落（节流，避免滚动期间频繁触发）
  let scrollTimeout: ReturnType<typeof setTimeout>;
  window.addEventListener('scroll', () => {
    if (!translationsVisible) return;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(translateVisibleParagraphs, 200);
  });
}

// 初始化选区翻译浮动按钮
initFloatingButton((text) => {
  orchestrator.translateSelection(text);
});

// 监听 DOM 变化，整页翻译激活时自动翻译新出现的段落（节流 150ms）
let mutationTimeout: ReturnType<typeof setTimeout>;
observeNewParagraphs(() => {
  if (pageTranslateActive && translationsVisible) {
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(translateVisibleParagraphs, 150);
  }
});

onMessage((message: MessageType) => {
  switch (message.type) {
    case 'TRIGGER_PAGE_TRANSLATE':
      handlePageTranslate();
      break;
    case 'TRANSLATION_RESULT':
      orchestrator.handleResult(message.payload.paragraphId, message.payload.translated);
      break;
    case 'TRANSLATION_ERROR':
      orchestrator.handleError(message.payload.paragraphId, message.payload.error);
      break;
  }
});
