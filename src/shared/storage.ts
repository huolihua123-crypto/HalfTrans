/**
 * Chrome Storage 封装
 * 提供用户设置和术语表的持久化读写
 * 被 background 和 options 页面调用
 */

import { UserSettings, TermEntry, DEFAULT_SETTINGS } from './types';

/** 从 chrome.storage.sync 读取用户设置，无数据时返回默认值 */
export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.sync.get('settings');
  return (result.settings as UserSettings) ?? DEFAULT_SETTINGS;
}

/** 将用户设置写入 chrome.storage.sync */
export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
}

/** 从 chrome.storage.sync 读取用户术语表 */
export async function getTerminology(): Promise<TermEntry[]> {
  const result = await chrome.storage.sync.get('terminology');
  return (result.terminology as TermEntry[]) ?? [];
}

/** 将用户术语表写入 chrome.storage.sync */
export async function saveTerminology(terms: TermEntry[]): Promise<void> {
  await chrome.storage.sync.set({ terminology: terms });
}
