import { DirectAPIProvider } from '@core/direct-api';
import { getSettings, getTerminology, getActiveApiConfig } from '@shared/storage';
import type { MessageType, TranslationContext } from '@shared/types';

const provider = new DirectAPIProvider();

const BATCH_SIZE = 12;
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'halftrans-translate-page') {
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_PAGE_TRANSLATE' } as MessageType);
  } else if (info.menuItemId === 'halftrans-translate-selection' && info.selectionText) {
    const emptyContext: TranslationContext = { pageContext: '', sectionContext: '', surroundingText: '', codeContext: '' };
    await translateSingle(tab.id, info.selectionText, `ctx-${Date.now()}`, emptyContext);
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

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function getUserTerms(): Promise<{ keepTerms: string[]; translateTerms: string[] }> {
  const terminology = await getTerminology();
  const keepTerms = terminology.filter((t) => t.keep).map((t) => t.term);
  const translateTerms = terminology.filter((t) => !t.keep).map((t) => t.term);
  return { keepTerms, translateTerms };
}

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
