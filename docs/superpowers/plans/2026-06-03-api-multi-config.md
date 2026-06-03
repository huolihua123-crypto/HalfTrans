# API 多配置管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single API config (apiBaseUrl/apiKey/model) with a multi-config system that supports presets, named profiles, and quick switching from both the Options page and Popup.

**Architecture:** Flat list of `ApiConfig` objects stored in `UserSettings.apiConfigs` with an `activeConfigId` pointer. Background layer resolves the active config before passing flat fields to the unchanged `DirectAPIProvider`. UI uses a dropdown+form pattern in Options and a simple selector in Popup.

**Tech Stack:** TypeScript, React, Tailwind CSS, chrome.storage.sync, Vitest

---

### Task 1: Update Types (`src/shared/types.ts`)

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Replace type definitions**

Replace the entire `src/shared/types.ts` content with:

```ts
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
```

Key changes:
- `TranslationRequest` and `BatchTranslationRequest` now carry flat `apiBaseUrl`/`apiKey`/`model` fields instead of a `settings` object — this decouples the provider from `UserSettings` shape.
- New `ApiConfig` interface and `API_PRESETS` constant.
- `UserSettings` uses `apiConfigs[]` + `activeConfigId` instead of single flat fields.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Type errors in `direct-api.ts`, `background/index.ts`, `options/App.tsx`, `popup/App.tsx`, and tests (we'll fix these in subsequent tasks).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "refactor: update types for multi API config support"
```

---

### Task 2: Update Storage Layer (`src/shared/storage.ts`)

**Files:**
- Modify: `src/shared/storage.ts`
- Modify: `tests/shared/storage.test.ts`

- [ ] **Step 1: Write failing test for `getActiveApiConfig`**

Replace `tests/shared/storage.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings, getTerminology, saveTerminology, getActiveApiConfig } from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { ApiConfig, UserSettings } from '@shared/types';

describe('storage', () => {
  beforeEach(async () => {
    await chrome.storage.sync.clear();
  });

  describe('getSettings', () => {
    it('returns default settings when none saved', async () => {
      const settings = await getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('returns saved settings', async () => {
      const config: ApiConfig = { id: 'cfg-1', name: 'Test', baseUrl: 'http://localhost', apiKey: 'sk-test', model: 'gpt-4o' };
      const custom: UserSettings = { ...DEFAULT_SETTINGS, apiConfigs: [config], activeConfigId: 'cfg-1' };
      await chrome.storage.sync.set({ settings: custom });
      const settings = await getSettings();
      expect(settings.apiConfigs).toHaveLength(1);
      expect(settings.activeConfigId).toBe('cfg-1');
    });
  });

  describe('saveSettings', () => {
    it('persists settings', async () => {
      const config: ApiConfig = { id: 'cfg-1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-abc', model: 'gpt-4o-mini' };
      await saveSettings({ ...DEFAULT_SETTINGS, apiConfigs: [config], activeConfigId: 'cfg-1' });
      const result = await chrome.storage.sync.get('settings');
      expect((result.settings as UserSettings).apiConfigs[0].apiKey).toBe('sk-abc');
    });
  });

  describe('getActiveApiConfig', () => {
    it('returns null when no configs exist', async () => {
      const config = await getActiveApiConfig();
      expect(config).toBeNull();
    });

    it('returns the active config by id', async () => {
      const configs: ApiConfig[] = [
        { id: 'cfg-1', name: 'A', baseUrl: 'http://a', apiKey: 'k1', model: 'm1' },
        { id: 'cfg-2', name: 'B', baseUrl: 'http://b', apiKey: 'k2', model: 'm2' },
      ];
      await saveSettings({ ...DEFAULT_SETTINGS, apiConfigs: configs, activeConfigId: 'cfg-2' });
      const config = await getActiveApiConfig();
      expect(config!.name).toBe('B');
      expect(config!.apiKey).toBe('k2');
    });

    it('falls back to first config if activeConfigId is invalid', async () => {
      const configs: ApiConfig[] = [
        { id: 'cfg-1', name: 'Fallback', baseUrl: 'http://fb', apiKey: 'k1', model: 'm1' },
      ];
      await saveSettings({ ...DEFAULT_SETTINGS, apiConfigs: configs, activeConfigId: 'nonexistent' });
      const config = await getActiveApiConfig();
      expect(config!.name).toBe('Fallback');
    });
  });

  describe('getTerminology', () => {
    it('returns empty array when none saved', async () => {
      const terms = await getTerminology();
      expect(terms).toEqual([]);
    });
  });

  describe('saveTerminology', () => {
    it('persists terminology list', async () => {
      const terms = [{ id: '1', term: 'event loop', keep: true }];
      await saveTerminology(terms);
      const result = await getTerminology();
      expect(result).toEqual(terms);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/storage.test.ts`
Expected: FAIL — `getActiveApiConfig` is not exported.

- [ ] **Step 3: Implement `getActiveApiConfig` in storage.ts**

Replace `src/shared/storage.ts` with:

```ts
import { UserSettings, TermEntry, DEFAULT_SETTINGS, ApiConfig } from './types';

export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.sync.get('settings');
  return (result.settings as UserSettings) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
}

export async function getActiveApiConfig(): Promise<ApiConfig | null> {
  const settings = await getSettings();
  if (!settings.apiConfigs.length) return null;
  return settings.apiConfigs.find(c => c.id === settings.activeConfigId) ?? settings.apiConfigs[0];
}

export async function getTerminology(): Promise<TermEntry[]> {
  const result = await chrome.storage.sync.get('terminology');
  return (result.terminology as TermEntry[]) ?? [];
}

export async function saveTerminology(terms: TermEntry[]): Promise<void> {
  await chrome.storage.sync.set({ terminology: terms });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/shared/storage.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage.ts tests/shared/storage.test.ts
git commit -m "feat: add getActiveApiConfig for multi-config support"
```

---

### Task 3: Update DirectAPIProvider (`src/core/direct-api.ts`)

**Files:**
- Modify: `src/core/direct-api.ts`
- Modify: `tests/core/direct-api.test.ts`

- [ ] **Step 1: Update DirectAPIProvider to use flat fields**

The `TranslationRequest` and `BatchTranslationRequest` now have `apiBaseUrl`/`apiKey`/`model`/`style` directly instead of a `settings` object. Update `src/core/direct-api.ts`:

```ts
import type { TranslationProvider } from './provider';
import type { TranslationRequest, TranslationResult, BatchTranslationRequest, BatchTranslationResult } from '@shared/types';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from './prompt';

export class DirectAPIProvider implements TranslationProvider {
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, paragraphId, apiBaseUrl, apiKey, model, style, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(style, keepTerms, translateTerms);
    const userPrompt = buildUserPrompt(text, context);

    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const translated = data.choices[0].message.content.trim();

    return { paragraphId, original: text, translated };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
    const { paragraphs, apiBaseUrl, apiKey, model, style, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(style, keepTerms, translateTerms);
    const userPrompt = buildBatchUserPrompt(paragraphs.map((p) => p.text), context);

    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const parsed = this.parseBatchResponse(content, paragraphs.length);

    if (parsed.length === paragraphs.length) {
      return {
        results: paragraphs.map((p, i) => ({
          paragraphId: p.id,
          original: p.text,
          translated: parsed[i],
        })),
      };
    }

    const results = await Promise.all(
      paragraphs.map((p) =>
        this.translate({ text: p.text, paragraphId: p.id, apiBaseUrl, apiKey, model, style, context, keepTerms, translateTerms })
      )
    );
    return { results };
  }

  private parseBatchResponse(content: string, expectedCount: number): string[] {
    const parts = content.split(/\[SEP\]/i).map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === expectedCount) {
      return parts;
    }
    const byNewlines = content.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (byNewlines.length === expectedCount) {
      return byNewlines;
    }
    return [];
  }
}
```

- [ ] **Step 2: Update direct-api tests**

Read the current test file to understand what it does, then update the test data to match the new `TranslationRequest` shape. Each test that constructs a request must use `apiBaseUrl`, `apiKey`, `model`, `style` instead of a `settings` object.

Example of updating a mock request in the test:

```ts
// Old:
const request = { text: 'hello', paragraphId: 'p1', settings: { apiBaseUrl: 'http://x', apiKey: 'k', model: 'm', style: 'colloquial' as const, shortcut: '' }, context, keepTerms: [], translateTerms: [] };

// New:
const request = { text: 'hello', paragraphId: 'p1', apiBaseUrl: 'http://x', apiKey: 'k', model: 'm', style: 'colloquial' as const, context, keepTerms: [], translateTerms: [] };
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/core/direct-api.test.ts`
Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/direct-api.ts tests/core/direct-api.test.ts
git commit -m "refactor: DirectAPIProvider uses flat request fields"
```

---

### Task 4: Update Background Service Worker (`src/background/index.ts`)

**Files:**
- Modify: `src/background/index.ts`

- [ ] **Step 1: Update background to resolve active config**

Replace the import section and the two translate functions to use `getActiveApiConfig`:

```ts
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
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors only in UI files (options/popup), which we fix next.

- [ ] **Step 3: Commit**

```bash
git add src/background/index.ts
git commit -m "refactor: background resolves active API config before translation"
```

---

### Task 5: Rewrite Options Page API Section (`src/options/App.tsx`)

**Files:**
- Modify: `src/options/App.tsx`

- [ ] **Step 1: Rewrite the Options page**

Replace `src/options/App.tsx` with:

```tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getSettings, saveSettings, getTerminology, saveTerminology } from '@shared/storage';
import type { UserSettings, TermEntry, ApiConfig } from '@shared/types';
import { DEFAULT_SETTINGS, API_PRESETS } from '@shared/types';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [terms, setTerms] = useState<TermEntry[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    getSettings().then(setSettings);
    getTerminology().then(setTerms);
  }, []);

  const debouncedSave = useCallback((updated: UserSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSettings(updated), 500);
  }, []);

  const updateSettings = (updated: UserSettings) => {
    setSettings(updated);
    debouncedSave(updated);
  };

  const immediatelySave = (updated: UserSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSettings(updated);
    saveSettings(updated);
  };

  const activeConfig = settings.apiConfigs.find(c => c.id === settings.activeConfigId) ?? settings.apiConfigs[0] ?? null;

  const updateActiveConfig = (patch: Partial<ApiConfig>) => {
    if (!activeConfig) return;
    const updatedConfigs = settings.apiConfigs.map(c =>
      c.id === activeConfig.id ? { ...c, ...patch } : c
    );
    updateSettings({ ...settings, apiConfigs: updatedConfigs });
  };

  const switchConfig = (id: string) => {
    immediatelySave({ ...settings, activeConfigId: id });
  };

  const addFromPreset = (preset: typeof API_PRESETS[number] | null) => {
    const newConfig: ApiConfig = {
      id: crypto.randomUUID(),
      name: preset?.name ?? '自定义',
      baseUrl: preset?.baseUrl ?? '',
      apiKey: '',
      model: preset?.model ?? '',
    };
    const updatedConfigs = [...settings.apiConfigs, newConfig];
    immediatelySave({ ...settings, apiConfigs: updatedConfigs, activeConfigId: newConfig.id });
    setShowPresetMenu(false);
  };

  const deleteConfig = () => {
    if (!activeConfig || settings.apiConfigs.length <= 1) return;
    const updatedConfigs = settings.apiConfigs.filter(c => c.id !== activeConfig.id);
    immediatelySave({ ...settings, apiConfigs: updatedConfigs, activeConfigId: updatedConfigs[0].id });
  };

  const addTerm = async () => {
    if (!newTerm.trim()) return;
    const entry: TermEntry = { id: crypto.randomUUID(), term: newTerm.trim(), keep: true };
    const updated = [...terms, entry];
    setTerms(updated);
    await saveTerminology(updated);
    setNewTerm('');
  };

  const removeTerm = async (id: string) => {
    const updated = terms.filter((t) => t.id !== id);
    setTerms(updated);
    await saveTerminology(updated);
  };

  const toggleTerm = async (id: string) => {
    const updated = terms.map((t) => (t.id === id ? { ...t, keep: !t.keep } : t));
    setTerms(updated);
    await saveTerminology(updated);
  };

  const exportTerms = () => {
    const blob = new Blob([JSON.stringify(terms, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'halftrans-terminology.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTerms = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as TermEntry[];
        setTerms(imported);
        await saveTerminology(imported);
      } catch { /* ignore invalid files */ }
    };
    reader.readAsText(file);
  };

  // First-time setup: show preset selection
  if (settings.apiConfigs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <h1 className="text-2xl font-bold">HalfTrans 设置</h1>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">选择一个 API 服务开始配置</h2>
          <p className="text-sm text-gray-500">选择后可继续修改，也可以之后添加更多配置。</p>
          <div className="grid grid-cols-2 gap-3">
            {API_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => addFromPreset(preset)}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 text-left transition"
              >
                <div className="font-medium">{preset.name}</div>
                <div className="text-xs text-gray-500 mt-1">{preset.baseUrl}</div>
                <div className="text-xs text-gray-400 mt-0.5">推荐模型：{preset.model}</div>
              </button>
            ))}
            <button
              onClick={() => addFromPreset(null)}
              className="p-4 border rounded-lg hover:border-gray-400 text-left transition border-dashed"
            >
              <div className="font-medium text-gray-600">自定义</div>
              <div className="text-xs text-gray-400 mt-1">手动填写 API 地址</div>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">HalfTrans 设置</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">API 配置</h2>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">当前配置：</label>
          <select
            value={settings.activeConfigId}
            onChange={(e) => switchConfig(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
          >
            {settings.apiConfigs.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="relative">
            <button
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              + 新增
            </button>
            {showPresetMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-10">
                {API_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => addFromPreset(preset)}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    {preset.name}
                  </button>
                ))}
                <button
                  onClick={() => addFromPreset(null)}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-t text-gray-600"
                >
                  自定义空白
                </button>
              </div>
            )}
          </div>
          <button
            onClick={deleteConfig}
            disabled={settings.apiConfigs.length <= 1}
            className="px-3 py-2 text-red-500 border border-red-200 rounded hover:bg-red-50 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            删除
          </button>
        </div>

        {activeConfig && (
          <div className="space-y-3 pl-1">
            <label className="block">
              <span className="text-sm text-gray-600">配置名称</span>
              <input
                type="text"
                value={activeConfig.name}
                onChange={(e) => updateActiveConfig({ name: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">API Base URL</span>
              <input
                type="text"
                value={activeConfig.baseUrl}
                onChange={(e) => updateActiveConfig({ baseUrl: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
                placeholder="https://api.openai.com/v1"
              />
              <span className="text-xs text-gray-400 mt-1 block">示例：https://api.deepseek.com/v1、http://localhost:11434/v1</span>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">API Key</span>
              <input
                type="password"
                value={activeConfig.apiKey}
                onChange={(e) => updateActiveConfig({ apiKey: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
                placeholder="sk-..."
              />
              <span className="text-xs text-gray-400 mt-1 block">格式：sk-... 或对应平台的密钥格式</span>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">模型</span>
              <input
                type="text"
                value={activeConfig.model}
                onChange={(e) => updateActiveConfig({ model: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
                placeholder="gpt-4o-mini"
              />
              <span className="text-xs text-gray-400 mt-1 block">示例：gpt-4o-mini、deepseek-chat、anthropic/claude-3.5-sonnet</span>
            </label>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">翻译设置</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">翻译风格</span>
            <select
              value={settings.style}
              onChange={(e) => immediatelySave({ ...settings, style: e.target.value as UserSettings['style'] })}
              className="mt-1 block w-full border rounded px-3 py-2"
            >
              <option value="colloquial">口语化</option>
              <option value="formal">书面化</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">自定义术语表</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
            className="flex-1 border rounded px-3 py-2"
            placeholder="输入术语，回车添加"
          />
          <button onClick={addTerm} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            添加
          </button>
        </div>

        <div className="space-y-1 max-h-64 overflow-y-auto">
          {terms.map((term) => (
            <div key={term.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded">
              <span className="font-mono text-sm">{term.term}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleTerm(term.id)}
                  className={`text-xs px-2 py-1 rounded ${term.keep ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}
                >
                  {term.keep ? '保留原文' : '翻译'}
                </button>
                <button onClick={() => removeTerm(term.id)} className="text-red-400 hover:text-red-600">×</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={exportTerms} className="text-sm text-blue-500 hover:underline">导出</button>
          <label className="text-sm text-blue-500 hover:underline cursor-pointer">
            导入
            <input type="file" accept=".json" onChange={importTerms} className="hidden" />
          </label>
        </div>
      </section>
    </div>
  );
}
```

Key changes:
- Removed the single "保存设置" button — auto-save with 500ms debounce on field edits, immediate save on config switching
- First-time setup screen with preset cards
- Dropdown + form for managing multiple configs
- Preset menu for adding new configs
- Hint text below each input

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Only popup errors remain (fixed in next task).

- [ ] **Step 3: Commit**

```bash
git add src/options/App.tsx
git commit -m "feat: rewrite Options page with multi API config management"
```

---

### Task 6: Update Popup with API Switcher (`src/popup/App.tsx`)

**Files:**
- Modify: `src/popup/App.tsx`

- [ ] **Step 1: Add API config switcher to Popup**

Replace `src/popup/App.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, getTerminology } from '@shared/storage';
import type { UserSettings, TranslationStyle } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [termCount, setTermCount] = useState(0);

  useEffect(() => {
    getSettings().then(setSettings);
    getTerminology().then((t) => setTermCount(t.length));
  }, []);

  const handleTranslatePage = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_PAGE_TRANSLATE' });
    }
  };

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings(updated);
  };

  const hasConfigs = settings.apiConfigs.length > 0;

  return (
    <div className="w-72 p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-800">HalfTrans</h1>

      <button
        onClick={handleTranslatePage}
        disabled={!hasConfigs}
        className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ▶ 翻译当前页
      </button>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">API</span>
          {hasConfigs ? (
            <select
              value={settings.activeConfigId}
              onChange={(e) => updateSetting('activeConfigId', e.target.value)}
              className="text-sm border rounded px-2 py-1 max-w-[160px]"
            >
              {settings.apiConfigs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="text-sm text-blue-500 hover:underline"
            >
              未配置 → 去设置
            </button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">翻译风格</span>
          <select
            value={settings.style}
            onChange={(e) => updateSetting('style', e.target.value as TranslationStyle)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="colloquial">口语化</option>
            <option value="formal">书面化</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600 border-t pt-3">
        <span>术语表：已有 {termCount} 条</span>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="text-blue-500 hover:underline"
        >
          编辑 →
        </button>
      </div>

      <button
        onClick={() => chrome.runtime.openOptionsPage()}
        className="w-full text-sm text-gray-500 hover:text-gray-700"
      >
        ⚙ 设置
      </button>
    </div>
  );
}
```

Key changes:
- Added API config dropdown between translate button and style selector
- Shows "未配置 → 去设置" link when no configs exist
- Disables translate button when no config available

- [ ] **Step 2: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/popup/App.tsx
git commit -m "feat: add API config switcher to Popup panel"
```

---

### Task 7: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass with no failures.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Build the extension**

Run: `npx vite build`
Expected: Build completes successfully with no errors.

- [ ] **Step 4: Commit any remaining fixes**

If any issues were found and fixed during verification, commit them:

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
