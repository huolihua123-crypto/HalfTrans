/**
 * Background Service Worker
 * Chrome 扩展的后台入口，负责：
 * 1. 注册右键菜单和快捷键
 * 2. 接收 content script 的翻译请求
 * 3. 批量调度 API 调用（分批 + 并发控制）
 * 4. 将翻译结果/错误回传给 content script
 */

import { DirectAPIProvider } from '@core/direct-api';
import { getSettings, getTerminology, getActiveApiConfig } from '@shared/storage';
import type { MessageType, TranslationContext } from '@shared/types';

const provider = new DirectAPIProvider();

// 每批发送给 API 的段落数（平衡单次请求大小和 token 限制）
const BATCH_SIZE = 12;
// 同时并发的批次数（避免触发 API 速率限制）
const MAX_CONCURRENT = 3;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'halftrans-translate-page',
    title: 'HalfTrans - 翻译全页',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'halftrans-translate-selection',
    title: 'HalfTrans - 翻译选中',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'halftrans-translate-page') {
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_PAGE_TRANSLATE' } as MessageType);
  } else if (info.menuItemId === 'halftrans-translate-selection' && info.selectionText) {
    // 转交给 content script，由编排器统一处理（复用 loading 弹窗 + 选区翻译流程）
    chrome.tabs.sendMessage(tab.id, {
      type: 'TRIGGER_SELECTION_TRANSLATE',
      payload: { text: info.selectionText },
    } as MessageType);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'translate-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_PAGE_TRANSLATE' } as MessageType);
    }
  }
});

chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return false;

  if (message.type === 'TRANSLATE_PARAGRAPHS') {
    translateBatch(tabId, message.payload.paragraphs, message.payload.context).then(() => sendResponse());
    return true;
  } else if (message.type === 'TRANSLATE_SELECTION') {
    translateSingle(tabId, message.payload.text, message.payload.id, message.payload.context).then(() => sendResponse());
    return true;
  }

  return false;
});

/** 通用数组分块工具：将数组按指定大小切分为二维数组 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** 从用户术语表中分离"保留英文"和"强制翻译"两类术语 */
async function getUserTerms(): Promise<{ keepTerms: string[]; translateTerms: string[] }> {
  const terminology = await getTerminology();
  const keepTerms = terminology.filter((t) => t.keep).map((t) => t.term);
  const translateTerms = terminology.filter((t) => !t.keep).map((t) => t.term);
  return { keepTerms, translateTerms };
}

/**
 * 批量翻译调度：将段落分批（BATCH_SIZE）后按并发限制（MAX_CONCURRENT）发送
 * 采用滑动窗口并发：每次最多 MAX_CONCURRENT 个批次同时请求，全部完成后处理下一组
 */
async function translateBatch(
  tabId: number,
  paragraphs: Array<{ id: string; text: string }>,
  context: TranslationContext
): Promise<void> {
  try {
    const apiConfig = await getActiveApiConfig();

    if (!apiConfig) {
      for (const p of paragraphs) {
        chrome.tabs.sendMessage(tabId, {
          type: 'TRANSLATION_ERROR',
          payload: { paragraphId: p.id, error: '请先在设置中配置 API' },
        } as MessageType);
      }
      return;
    }

    const settings = await getSettings();
    const { keepTerms, translateTerms } = await getUserTerms();
    const batches = chunk(paragraphs, BATCH_SIZE);

    const processBatch = async (batch: Array<{ id: string; text: string }>) => {
      const result = await provider.translateBatch({
        paragraphs: batch,
        apiBaseUrl: apiConfig.baseUrl,
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
        style: settings.style,
        context,
        keepTerms,
        translateTerms,
      });

      for (const r of result.results) {
        chrome.tabs.sendMessage(tabId, {
          type: 'TRANSLATION_RESULT',
          payload: r,
        } as MessageType);
      }
    };

    // 滑动窗口并发：按 MAX_CONCURRENT 分组，组内并行，组间串行
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
      const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT);
      await Promise.all(concurrentBatches.map(processBatch));
    }
  } catch (err) {
    for (const p of paragraphs) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TRANSLATION_ERROR',
        payload: { paragraphId: p.id, error: (err as Error).message },
      } as MessageType);
    }
  }
}

/** 单条翻译：用于选区翻译和右键菜单翻译 */
async function translateSingle(
  tabId: number,
  text: string,
  paragraphId: string,
  context: TranslationContext
): Promise<void> {
  try {
    const apiConfig = await getActiveApiConfig();

    if (!apiConfig) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TRANSLATION_ERROR',
        payload: { paragraphId, error: '请先在设置中配置 API' },
      } as MessageType);
      return;
    }

    const settings = await getSettings();
    const { keepTerms, translateTerms } = await getUserTerms();

    const result = await provider.translate({
      text,
      paragraphId,
      apiBaseUrl: apiConfig.baseUrl,
      apiKey: apiConfig.apiKey,
      model: apiConfig.model,
      style: settings.style,
      context,
      keepTerms,
      translateTerms,
    });

    chrome.tabs.sendMessage(tabId, {
      type: 'TRANSLATION_RESULT',
      payload: result,
    } as MessageType);
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      type: 'TRANSLATION_ERROR',
      payload: { paragraphId, error: (err as Error).message },
    } as MessageType);
  }
}
