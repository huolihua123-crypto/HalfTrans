/**
 * 核心类型定义
 * 定义翻译请求/响应、用户设置、消息协议等全局共享类型
 * 被所有模块引用，是系统的类型契约层
 */

export type TranslationStyle = 'colloquial' | 'formal';

export interface UserSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  style: TranslationStyle;
  shortcut: string;
}

export interface TermEntry {
  id: string;
  term: string;
  keep: boolean;
}

export interface TranslationContext {
  pageContext: string;
  sectionContext: string;
  surroundingText: string;
  codeContext: string;
}

export interface TranslationRequest {
  text: string;
  paragraphId: string;
  settings: UserSettings;
  context: TranslationContext;
  keepTerms: string[];
  translateTerms: string[];
}

export interface TranslationResult {
  paragraphId: string;
  original: string;
  translated: string;
}

export interface BatchTranslationRequest {
  paragraphs: Array<{ id: string; text: string }>;
  settings: UserSettings;
  context: TranslationContext;
  keepTerms: string[];
  translateTerms: string[];
}

export interface BatchTranslationResult {
  results: TranslationResult[];
}

export type MessageType =
  | { type: 'TRANSLATE_PARAGRAPHS'; payload: { paragraphs: Array<{ id: string; text: string }>; context: TranslationContext } }
  | { type: 'TRANSLATE_SELECTION'; payload: { text: string; id: string; context: TranslationContext } }
  | { type: 'TRANSLATION_RESULT'; payload: TranslationResult }
  | { type: 'TRANSLATION_ERROR'; payload: { paragraphId: string; error: string } }
  | { type: 'TRIGGER_PAGE_TRANSLATE' };

export const DEFAULT_SETTINGS: UserSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  style: 'colloquial',
  shortcut: 'Ctrl+Shift+T',
};
