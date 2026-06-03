export type TranslationStyle = 'colloquial' | 'formal';

export interface ApiConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const API_PRESETS: Omit<ApiConfig, 'id' | 'apiKey'>[] = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Claude (中转)', baseUrl: 'https://api.openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
  { name: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5' },
];

export interface UserSettings {
  apiConfigs: ApiConfig[];
  activeConfigId: string;
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
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  style: TranslationStyle;
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
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  style: TranslationStyle;
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
  apiConfigs: [],
  activeConfigId: '',
  style: 'colloquial',
  shortcut: 'Ctrl+Shift+T',
};
