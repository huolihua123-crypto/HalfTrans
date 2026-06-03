/**
 * 消息通信封装
 * 封装 chrome.runtime 消息 API，提供类型安全的发送和监听接口
 * content script 用 sendToBackground 发消息，background 用 sendToTab 回传结果
 */

import type { MessageType } from './types';

/** 从 content script 向 background service worker 发送消息 */
export async function sendToBackground(message: MessageType): Promise<void> {
  await chrome.runtime.sendMessage(message);
}

/** 从 background 向指定 tab 的 content script 发送消息 */
export async function sendToTab(tabId: number, message: MessageType): Promise<void> {
  await chrome.tabs.sendMessage(tabId, message);
}

type MessageHandler = (
  message: MessageType,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => void | boolean;

/** 注册消息监听器，content script 和 background 各自调用以处理不同消息类型 */
export function onMessage(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener(handler);
}
