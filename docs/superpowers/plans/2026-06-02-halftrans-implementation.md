# HalfTrans v1.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (Manifest V3) that translates English web content into Chinese-English hybrid text, preserving technical terminology for minimal cognitive load.

**Architecture:** Pure frontend Chrome extension with Content Script for page interaction, Service Worker for coordination, and React-based Popup/Options pages. Translation logic is abstracted behind a `TranslationProvider` interface for future extensibility. Viewport-first progressive translation with full-text terminology consistency.

**Tech Stack:** TypeScript, Vite + CRXJS, React, Tailwind CSS, Shadow DOM (content styles), chrome.storage API, Vitest

---

## File Structure

```
halftrans/
├── src/
│   ├── shared/
│   │   ├── types.ts              # All shared type definitions
│   │   ├── storage.ts            # chrome.storage wrapper
│   │   └── messaging.ts         # Extension message passing
│   ├── core/
│   │   ├── provider.ts           # TranslationProvider interface + factory
│   │   ├── direct-api.ts         # DirectAPIProvider (OpenAI-compatible)
│   │   ├── terminology.ts        # Terminology table management + consistency
│   │   └── prompt.ts             # Prompt construction (style, intensity, terms)
│   ├── background/
│   │   └── index.ts              # Service Worker: menus, shortcuts, coordination
│   ├── content/
│   │   ├── index.ts              # Entry: init, message listeners
│   │   ├── detector.ts           # Viewport paragraph detection
│   │   ├── renderer.ts           # Translation result DOM insertion
│   │   ├── floating-btn.ts       # Selection floating button
│   │   ├── translator.ts         # Orchestrator: queue, dedup, scroll handling
│   │   └── styles/
│   │       └── content.css       # Injected styles (Shadow DOM)
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx              # React entry
│   │   └── App.tsx               # Popup panel UI
│   ├── options/
│   │   ├── index.html
│   │   ├── main.tsx              # React entry
│   │   └── App.tsx               # Options page UI
│   └── manifest.json
├── tests/
│   ├── core/
│   │   ├── provider.test.ts
│   │   ├── direct-api.test.ts
│   │   ├── terminology.test.ts
│   │   └── prompt.test.ts
│   ├── content/
│   │   ├── detector.test.ts
│   │   ├── renderer.test.ts
│   │   ├── floating-btn.test.ts
│   │   └── translator.test.ts
│   ├── shared/
│   │   ├── storage.test.ts
│   │   └── messaging.test.ts
│   └── setup.ts                  # Test setup (chrome API mocks)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `src/manifest.json`, `tests/setup.ts`

- [ ] **Step 1: Initialize project**

```bash
cd c:\claude-project\chrome-translate
mkdir halftrans && cd halftrans
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom
npm install -D typescript vite @crxjs/vite-plugin@beta @types/react @types/react-dom @types/chrome tailwindcss postcss autoprefixer vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@core/*": ["src/core/*"],
      "@content/*": ["src/content/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@core': resolve(__dirname, 'src/core'),
      '@content': resolve(__dirname, 'src/content'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 5: Create tailwind.config.js and postcss.config.js**

`tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/popup/**/*.{tsx,html}', './src/options/**/*.{tsx,html}'],
  theme: { extend: {} },
  plugins: [],
};
```

`postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create src/manifest.json**

```json
{
  "manifest_version": 3,
  "name": "HalfTrans",
  "version": "1.0.0",
  "description": "Translate English content into minimal-cognitive-cost Chinese-English hybrid for internet professionals.",
  "permissions": ["contextMenus", "storage", "activeTab"],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"]
    }
  ],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "options_ui": {
    "page": "src/options/index.html",
    "open_in_tab": true
  },
  "commands": {
    "translate-page": {
      "suggested_key": { "default": "Ctrl+Shift+T", "mac": "Command+Shift+T" },
      "description": "Translate current page"
    }
  }
}
```

- [ ] **Step 7: Create test setup file**

`tests/setup.ts`:
```typescript
import '@testing-library/jest-dom';

const storageMock = (() => {
  let store: Record<string, unknown> = {};
  return {
    get: (keys: string | string[]) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
      const result: Record<string, unknown> = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => { result[k] = store[k]; });
      return Promise.resolve(result);
    },
    set: (items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    },
    clear: () => { store = {}; return Promise.resolve(); },
  };
})();

global.chrome = {
  storage: { sync: storageMock, local: storageMock },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
  commands: { onCommand: { addListener: vi.fn() } },
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
} as unknown as typeof chrome;
```

- [ ] **Step 8: Add scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

- [ ] **Step 9: Verify setup**

```bash
npx vitest run
```

Expected: 0 tests found, no errors. Build system initialized.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: scaffold HalfTrans project with Vite + CRXJS + React + Vitest"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create type definitions**

`src/shared/types.ts`:
```typescript
export type TranslationStyle = 'colloquial' | 'formal';
export type RetentionIntensity = 'conservative' | 'aggressive';

export interface UserSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  style: TranslationStyle;
  intensity: RetentionIntensity;
  shortcut: string;
}

export interface TermEntry {
  id: string;
  term: string;
  keep: boolean; // true = keep original, false = translate
}

export interface TranslationRequest {
  text: string;
  paragraphId: string;
  settings: UserSettings;
  terminology: TermEntry[];
  contextTerms: TermRecord[];
}

export interface TranslationResult {
  paragraphId: string;
  original: string;
  translated: string;
  termsUsed: TermRecord[];
}

export interface TermRecord {
  term: string;
  kept: boolean;
}

export type MessageType =
  | { type: 'TRANSLATE_PARAGRAPHS'; payload: { paragraphs: Array<{ id: string; text: string }> } }
  | { type: 'TRANSLATE_SELECTION'; payload: { text: string; id: string } }
  | { type: 'TRANSLATION_RESULT'; payload: TranslationResult }
  | { type: 'TRANSLATION_ERROR'; payload: { paragraphId: string; error: string } }
  | { type: 'TRIGGER_PAGE_TRANSLATE' };

export const DEFAULT_SETTINGS: UserSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  style: 'colloquial',
  intensity: 'conservative',
  shortcut: 'Ctrl+Shift+T',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared type definitions"
```

---

## Task 3: Storage Wrapper

**Files:**
- Create: `src/shared/storage.ts`, `tests/shared/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/shared/storage.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings, getTerminology, saveTerminology } from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/types';

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
      const custom = { ...DEFAULT_SETTINGS, model: 'deepseek-chat' };
      await chrome.storage.sync.set({ settings: custom });
      const settings = await getSettings();
      expect(settings.model).toBe('deepseek-chat');
    });
  });

  describe('saveSettings', () => {
    it('persists settings', async () => {
      await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'sk-test' });
      const result = await chrome.storage.sync.get('settings');
      expect((result.settings as typeof DEFAULT_SETTINGS).apiKey).toBe('sk-test');
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

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/shared/storage.test.ts
```

Expected: FAIL — module `@shared/storage` not found.

- [ ] **Step 3: Implement storage wrapper**

`src/shared/storage.ts`:
```typescript
import { UserSettings, TermEntry, DEFAULT_SETTINGS } from './types';

export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.sync.get('settings');
  return (result.settings as UserSettings) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
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

```bash
npx vitest run tests/shared/storage.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage.ts tests/shared/storage.test.ts
git commit -m "feat: add chrome.storage wrapper with settings and terminology"
```

---

## Task 4: Messaging Wrapper

**Files:**
- Create: `src/shared/messaging.ts`, `tests/shared/messaging.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/shared/messaging.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { sendToBackground, sendToTab, onMessage } from '@shared/messaging';
import type { MessageType } from '@shared/types';

describe('messaging', () => {
  it('sendToBackground calls chrome.runtime.sendMessage', async () => {
    const msg: MessageType = { type: 'TRIGGER_PAGE_TRANSLATE' };
    await sendToBackground(msg);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(msg);
  });

  it('sendToTab calls chrome.tabs.sendMessage', async () => {
    const msg: MessageType = { type: 'TRIGGER_PAGE_TRANSLATE' };
    await sendToTab(1, msg);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, msg);
  });

  it('onMessage registers a listener', () => {
    const handler = vi.fn();
    onMessage(handler);
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(handler);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/shared/messaging.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement messaging wrapper**

`src/shared/messaging.ts`:
```typescript
import type { MessageType } from './types';

export async function sendToBackground(message: MessageType): Promise<void> {
  await chrome.runtime.sendMessage(message);
}

export async function sendToTab(tabId: number, message: MessageType): Promise<void> {
  await chrome.tabs.sendMessage(tabId, message);
}

type MessageHandler = (
  message: MessageType,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => void | boolean;

export function onMessage(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener(handler);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/shared/messaging.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messaging.ts tests/shared/messaging.test.ts
git commit -m "feat: add extension messaging wrapper"
```

---

## Task 5: Terminology Management

**Files:**
- Create: `src/core/terminology.ts`, `tests/core/terminology.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/core/terminology.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildTermContext, mergeTermRecords } from '@core/terminology';
import type { TermEntry, TermRecord } from '@shared/types';

describe('terminology', () => {
  describe('buildTermContext', () => {
    it('returns user-defined terms found in text', () => {
      const terms: TermEntry[] = [
        { id: '1', term: 'event loop', keep: true },
        { id: '2', term: 'callback', keep: true },
        { id: '3', term: 'database', keep: false },
      ];
      const text = 'The event loop handles callback execution.';
      const result = buildTermContext(terms, text);
      expect(result).toEqual([
        { term: 'event loop', keep: true },
        { term: 'callback', keep: true },
      ]);
    });

    it('is case-insensitive when matching', () => {
      const terms: TermEntry[] = [{ id: '1', term: 'API', keep: true }];
      const text = 'The api endpoint returns JSON.';
      const result = buildTermContext(terms, text);
      expect(result).toEqual([{ term: 'API', keep: true }]);
    });

    it('returns empty array when no terms match', () => {
      const terms: TermEntry[] = [{ id: '1', term: 'Redux', keep: true }];
      const text = 'The server handles requests.';
      const result = buildTermContext(terms, text);
      expect(result).toEqual([]);
    });
  });

  describe('mergeTermRecords', () => {
    it('merges new records into existing without duplicates', () => {
      const existing: TermRecord[] = [{ term: 'event loop', kept: true }];
      const incoming: TermRecord[] = [
        { term: 'event loop', kept: true },
        { term: 'callback', kept: true },
      ];
      const result = mergeTermRecords(existing, incoming);
      expect(result).toEqual([
        { term: 'event loop', kept: true },
        { term: 'callback', kept: true },
      ]);
    });

    it('preserves existing decision on conflict', () => {
      const existing: TermRecord[] = [{ term: 'API', kept: true }];
      const incoming: TermRecord[] = [{ term: 'API', kept: false }];
      const result = mergeTermRecords(existing, incoming);
      expect(result).toEqual([{ term: 'API', kept: true }]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/core/terminology.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement terminology module**

`src/core/terminology.ts`:
```typescript
import type { TermEntry, TermRecord } from '@shared/types';

export function buildTermContext(userTerms: TermEntry[], text: string): TermRecord[] {
  const lowerText = text.toLowerCase();
  return userTerms
    .filter((entry) => lowerText.includes(entry.term.toLowerCase()))
    .map((entry) => ({ term: entry.term, kept: entry.keep }));
}

export function mergeTermRecords(existing: TermRecord[], incoming: TermRecord[]): TermRecord[] {
  const map = new Map<string, boolean>();
  for (const rec of existing) {
    map.set(rec.term.toLowerCase(), rec.kept);
  }
  for (const rec of incoming) {
    const key = rec.term.toLowerCase();
    if (!map.has(key)) {
      map.set(key, rec.kept);
    }
  }
  return Array.from(map.entries()).map(([term, kept]) => {
    const original = [...existing, ...incoming].find((r) => r.term.toLowerCase() === term);
    return { term: original?.term ?? term, kept };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/core/terminology.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/terminology.ts tests/core/terminology.test.ts
git commit -m "feat: add terminology context builder and record merger"
```

---

## Task 6: Prompt Construction

**Files:**
- Create: `src/core/prompt.ts`, `tests/core/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/core/prompt.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '@core/prompt';
import type { TermRecord } from '@shared/types';

describe('prompt', () => {
  describe('buildSystemPrompt', () => {
    it('includes style instruction for colloquial', () => {
      const prompt = buildSystemPrompt('colloquial', 'conservative', []);
      expect(prompt).toContain('口语化');
    });

    it('includes style instruction for formal', () => {
      const prompt = buildSystemPrompt('formal', 'aggressive', []);
      expect(prompt).toContain('书面化');
    });

    it('includes conservative retention instruction', () => {
      const prompt = buildSystemPrompt('colloquial', 'conservative', []);
      expect(prompt).toContain('保留更多英文');
    });

    it('includes aggressive retention instruction', () => {
      const prompt = buildSystemPrompt('colloquial', 'aggressive', []);
      expect(prompt).toContain('尽量翻译');
    });

    it('includes terminology constraints when terms provided', () => {
      const terms: TermRecord[] = [
        { term: 'event loop', kept: true },
        { term: '异步', kept: false },
      ];
      const prompt = buildSystemPrompt('colloquial', 'conservative', terms);
      expect(prompt).toContain('event loop');
      expect(prompt).toContain('保留原文');
    });
  });

  describe('buildUserPrompt', () => {
    it('wraps text for translation', () => {
      const prompt = buildUserPrompt('The event loop runs callbacks.');
      expect(prompt).toContain('The event loop runs callbacks.');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/core/prompt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompt construction**

`src/core/prompt.ts`:
```typescript
import type { TranslationStyle, RetentionIntensity, TermRecord } from '@shared/types';

export function buildSystemPrompt(
  style: TranslationStyle,
  intensity: RetentionIntensity,
  contextTerms: TermRecord[]
): string {
  const styleInstruction =
    style === 'colloquial'
      ? '翻译风格要口语化，自然流畅，像同事之间交流一样。'
      : '翻译风格要书面化，正式专业，适合文档阅读。';

  const intensityInstruction =
    intensity === 'conservative'
      ? '保留更多英文专业术语不翻译，只翻译连接词和普通词汇。'
      : '尽量翻译为中文，只保留最核心的、翻译后反而难懂的术语。';

  let termInstruction = '';
  if (contextTerms.length > 0) {
    const keepTerms = contextTerms.filter((t) => t.kept).map((t) => t.term);
    const translateTerms = contextTerms.filter((t) => !t.kept).map((t) => t.term);

    if (keepTerms.length > 0) {
      termInstruction += `\n以下术语必须保留原文不翻译：${keepTerms.join('、')}`;
    }
    if (translateTerms.length > 0) {
      termInstruction += `\n以下术语必须翻译为中文：${translateTerms.join('、')}`;
    }
    termInstruction += '\n对于同一个术语，全文保持一致的处理方式。';
  }

  return `你是一个专业的技术内容翻译助手。你的任务是将英文内容翻译为中英混合表达，目标是最小化读者的认知成本。

规则：
1. ${styleInstruction}
2. ${intensityInstruction}
3. 对于同一术语，全文中必须保持一致的处理（要么都保留英文，要么都翻译）。
4. 只输出翻译结果，不要解释或添加额外内容。${termInstruction}`;
}

export function buildUserPrompt(text: string): string {
  return `请翻译以下内容：\n\n${text}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/core/prompt.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt.ts tests/core/prompt.test.ts
git commit -m "feat: add prompt construction with style, intensity, and terminology"
```

---

## Task 7: TranslationProvider Interface + DirectAPIProvider

**Files:**
- Create: `src/core/provider.ts`, `src/core/direct-api.ts`, `tests/core/direct-api.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/core/direct-api.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectAPIProvider } from '@core/direct-api';
import type { TranslationRequest } from '@shared/types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DirectAPIProvider', () => {
  const provider = new DirectAPIProvider();

  const baseRequest: TranslationRequest = {
    text: 'The event loop handles callbacks.',
    paragraphId: 'p1',
    settings: {
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      style: 'colloquial',
      intensity: 'conservative',
      shortcut: 'Ctrl+Shift+T',
    },
    terminology: [],
    contextTerms: [],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('calls the correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'event loop 处理 callbacks。' } }],
      }),
    });

    await provider.translate(baseRequest);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns translated text on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'event loop 处理 callbacks。' } }],
      }),
    });

    const result = await provider.translate(baseRequest);
    expect(result.translated).toBe('event loop 处理 callbacks。');
    expect(result.paragraphId).toBe('p1');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(provider.translate(baseRequest)).rejects.toThrow('API error: 401');
  });

  it('includes API key in authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'translated' } }],
      }),
    });

    await provider.translate(baseRequest);
    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers['Authorization']).toBe('Bearer sk-test');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/core/direct-api.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create TranslationProvider interface**

`src/core/provider.ts`:
```typescript
import type { TranslationRequest, TranslationResult } from '@shared/types';

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
```

- [ ] **Step 4: Implement DirectAPIProvider**

`src/core/direct-api.ts`:
```typescript
import type { TranslationProvider } from './provider';
import type { TranslationRequest, TranslationResult } from '@shared/types';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { buildTermContext } from './terminology';

export class DirectAPIProvider implements TranslationProvider {
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, paragraphId, settings, terminology, contextTerms } = request;

    const detectedTerms = buildTermContext(terminology, text);
    const allTerms = [...contextTerms, ...detectedTerms];

    const systemPrompt = buildSystemPrompt(settings.style, settings.intensity, allTerms);
    const userPrompt = buildUserPrompt(text);

    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const translated = data.choices[0].message.content.trim();

    return {
      paragraphId,
      original: text,
      translated,
      termsUsed: allTerms,
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/core/direct-api.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/provider.ts src/core/direct-api.ts tests/core/direct-api.test.ts
git commit -m "feat: add TranslationProvider interface and DirectAPIProvider"
```

---

## Task 8: Viewport Paragraph Detector

**Files:**
- Create: `src/content/detector.ts`, `tests/content/detector.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/content/detector.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectVisibleParagraphs, observeNewParagraphs } from '@content/detector';

describe('detector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('detectVisibleParagraphs', () => {
    it('returns paragraphs with text content', () => {
      document.body.innerHTML = `
        <p id="p1">Hello world</p>
        <p id="p2">Another paragraph</p>
        <p id="p3"></p>
      `;

      const paragraphs = detectVisibleParagraphs();
      expect(paragraphs.length).toBe(2);
      expect(paragraphs[0].text).toBe('Hello world');
      expect(paragraphs[1].text).toBe('Another paragraph');
    });

    it('assigns stable IDs to paragraphs', () => {
      document.body.innerHTML = '<p>Test content</p>';
      const first = detectVisibleParagraphs();
      const second = detectVisibleParagraphs();
      expect(first[0].id).toBe(second[0].id);
    });

    it('skips paragraphs already marked as translated', () => {
      document.body.innerHTML = `
        <p data-halftrans="done">Already translated</p>
        <p>New content</p>
      `;
      const paragraphs = detectVisibleParagraphs();
      expect(paragraphs.length).toBe(1);
      expect(paragraphs[0].text).toBe('New content');
    });

    it('detects headings and list items too', () => {
      document.body.innerHTML = `
        <h1>Title</h1>
        <li>List item</li>
      `;
      const paragraphs = detectVisibleParagraphs();
      expect(paragraphs.length).toBe(2);
    });
  });

  describe('observeNewParagraphs', () => {
    it('calls callback when new content is added', async () => {
      const callback = vi.fn();
      observeNewParagraphs(callback);

      const p = document.createElement('p');
      p.textContent = 'Dynamic content';
      document.body.appendChild(p);

      await new Promise((r) => setTimeout(r, 100));
      expect(callback).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/content/detector.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement detector**

`src/content/detector.ts`:
```typescript
const TRANSLATABLE_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption';
const ATTR_ID = 'data-halftrans-id';
const ATTR_DONE = 'data-halftrans';

let idCounter = 0;

function getOrAssignId(el: Element): string {
  let id = el.getAttribute(ATTR_ID);
  if (!id) {
    id = `ht-${idCounter++}`;
    el.setAttribute(ATTR_ID, id);
  }
  return id;
}

export function detectVisibleParagraphs(): Array<{ id: string; text: string; element: Element }> {
  const elements = document.querySelectorAll(TRANSLATABLE_SELECTORS);
  const results: Array<{ id: string; text: string; element: Element }> = [];

  for (const el of elements) {
    if (el.getAttribute(ATTR_DONE)) continue;
    const text = el.textContent?.trim() ?? '';
    if (text.length === 0) continue;
    if (!isInViewport(el)) continue;

    results.push({ id: getOrAssignId(el), text, element: el });
  }

  return results;
}

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

export function observeNewParagraphs(callback: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    const hasNewNodes = mutations.some(
      (m) => m.addedNodes.length > 0 || m.type === 'characterData'
    );
    if (hasNewNodes) callback();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return observer;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content/detector.test.ts
```

Expected: All 5 tests PASS (note: `isInViewport` returns false in jsdom since `getBoundingClientRect` returns zeros — mock or adjust test to account for jsdom limitation).

If viewport tests fail due to jsdom, add this to the test file before the `detectVisibleParagraphs` tests:
```typescript
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/content/detector.ts tests/content/detector.test.ts
git commit -m "feat: add viewport paragraph detector with MutationObserver"
```

---

## Task 9: Translation Result Renderer

**Files:**
- Create: `src/content/renderer.ts`, `src/content/styles/content.css`, `tests/content/renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/content/renderer.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderTranslation, removeTranslation } from '@content/renderer';

describe('renderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p data-halftrans-id="p1">Original text</p>';
  });

  describe('renderTranslation', () => {
    it('inserts translation below the original paragraph', () => {
      renderTranslation('p1', 'translated text');
      const result = document.querySelector('[data-halftrans-result="p1"]');
      expect(result).not.toBeNull();
      expect(result!.textContent).toContain('translated text');
    });

    it('marks the original paragraph as translated', () => {
      renderTranslation('p1', 'translated text');
      const original = document.querySelector('[data-halftrans-id="p1"]');
      expect(original!.getAttribute('data-halftrans')).toBe('done');
    });

    it('includes a close button', () => {
      renderTranslation('p1', 'translated text');
      const closeBtn = document.querySelector('[data-halftrans-result="p1"] button');
      expect(closeBtn).not.toBeNull();
    });

    it('does not duplicate if called twice for same paragraph', () => {
      renderTranslation('p1', 'first');
      renderTranslation('p1', 'second');
      const results = document.querySelectorAll('[data-halftrans-result="p1"]');
      expect(results.length).toBe(1);
      expect(results[0].textContent).toContain('second');
    });
  });

  describe('removeTranslation', () => {
    it('removes the translation element', () => {
      renderTranslation('p1', 'translated text');
      removeTranslation('p1');
      const result = document.querySelector('[data-halftrans-result="p1"]');
      expect(result).toBeNull();
    });

    it('clears the translated marker on original', () => {
      renderTranslation('p1', 'translated text');
      removeTranslation('p1');
      const original = document.querySelector('[data-halftrans-id="p1"]');
      expect(original!.hasAttribute('data-halftrans')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/content/renderer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create content styles**

`src/content/styles/content.css`:
```css
.halftrans-result {
  margin: 4px 0 8px 0;
  padding: 8px 12px;
  border-left: 3px solid #4f9cf8;
  background-color: #f0f7ff;
  font-size: 0.95em;
  line-height: 1.6;
  color: #333;
  position: relative;
}

.halftrans-result .halftrans-close {
  position: absolute;
  top: 4px;
  right: 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #999;
  padding: 2px 6px;
}

.halftrans-result .halftrans-close:hover {
  color: #333;
}

.halftrans-loading {
  margin: 4px 0;
  padding: 8px 12px;
  color: #999;
  font-style: italic;
}
```

- [ ] **Step 4: Implement renderer**

`src/content/renderer.ts`:
```typescript
export function renderTranslation(paragraphId: string, translatedText: string): void {
  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  if (!original) return;

  let resultEl = document.querySelector(`[data-halftrans-result="${paragraphId}"]`);

  if (resultEl) {
    const textSpan = resultEl.querySelector('.halftrans-text');
    if (textSpan) textSpan.textContent = translatedText;
  } else {
    resultEl = document.createElement('div');
    resultEl.setAttribute('data-halftrans-result', paragraphId);
    resultEl.className = 'halftrans-result';

    const textSpan = document.createElement('span');
    textSpan.className = 'halftrans-text';
    textSpan.textContent = translatedText;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'halftrans-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => removeTranslation(paragraphId));

    resultEl.appendChild(textSpan);
    resultEl.appendChild(closeBtn);
    original.after(resultEl);
  }

  original.setAttribute('data-halftrans', 'done');
  removeLoading(paragraphId);
}

export function renderLoading(paragraphId: string): void {
  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  if (!original) return;
  if (document.querySelector(`[data-halftrans-loading="${paragraphId}"]`)) return;

  const loader = document.createElement('div');
  loader.setAttribute('data-halftrans-loading', paragraphId);
  loader.className = 'halftrans-loading';
  loader.textContent = '翻译中...';
  original.after(loader);
}

export function renderError(paragraphId: string, error: string): void {
  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  if (!original) return;

  removeLoading(paragraphId);

  const errorEl = document.createElement('div');
  errorEl.setAttribute('data-halftrans-result', paragraphId);
  errorEl.className = 'halftrans-result';
  errorEl.style.borderLeftColor = '#e74c3c';
  errorEl.style.backgroundColor = '#fdf0f0';

  const textSpan = document.createElement('span');
  textSpan.className = 'halftrans-text';
  textSpan.textContent = `翻译失败：${error}`;

  const retryBtn = document.createElement('button');
  retryBtn.className = 'halftrans-close';
  retryBtn.textContent = '↻';
  retryBtn.title = '重试';

  errorEl.appendChild(textSpan);
  errorEl.appendChild(retryBtn);
  original.after(errorEl);
}

export function removeTranslation(paragraphId: string): void {
  const resultEl = document.querySelector(`[data-halftrans-result="${paragraphId}"]`);
  resultEl?.remove();

  const original = document.querySelector(`[data-halftrans-id="${paragraphId}"]`);
  original?.removeAttribute('data-halftrans');
}

function removeLoading(paragraphId: string): void {
  const loader = document.querySelector(`[data-halftrans-loading="${paragraphId}"]`);
  loader?.remove();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/content/renderer.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/renderer.ts src/content/styles/content.css tests/content/renderer.test.ts
git commit -m "feat: add translation result renderer with loading and error states"
```

---

## Task 10: Floating Selection Button

**Files:**
- Create: `src/content/floating-btn.ts`, `tests/content/floating-btn.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/content/floating-btn.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initFloatingButton, destroyFloatingButton } from '@content/floating-btn';

describe('floating-btn', () => {
  let onTranslate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '<p>Some selectable text here</p>';
    onTranslate = vi.fn();
    destroyFloatingButton();
  });

  it('shows button on text selection', () => {
    initFloatingButton(onTranslate);

    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    selection.removeAllRanges();
    selection.addRange(range);

    document.dispatchEvent(new Event('selectionchange'));

    const btn = document.querySelector('.halftrans-float-btn');
    expect(btn).not.toBeNull();
  });

  it('hides button when selection is empty', () => {
    initFloatingButton(onTranslate);

    // Create then clear selection
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));

    const btn = document.querySelector('.halftrans-float-btn');
    expect(btn).toBeNull();
  });

  it('calls onTranslate with selected text when clicked', () => {
    initFloatingButton(onTranslate);

    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    selection.removeAllRanges();
    selection.addRange(range);

    document.dispatchEvent(new Event('selectionchange'));

    const btn = document.querySelector('.halftrans-float-btn') as HTMLElement;
    btn?.click();

    expect(onTranslate).toHaveBeenCalledWith('Some selectable text here');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/content/floating-btn.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement floating button**

`src/content/floating-btn.ts`:
```typescript
let floatBtn: HTMLElement | null = null;
let currentCallback: ((text: string) => void) | null = null;

export function initFloatingButton(onTranslate: (text: string) => void): void {
  currentCallback = onTranslate;
  document.addEventListener('selectionchange', handleSelectionChange);
}

export function destroyFloatingButton(): void {
  document.removeEventListener('selectionchange', handleSelectionChange);
  removeButton();
  currentCallback = null;
}

function handleSelectionChange(): void {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';

  if (text.length === 0) {
    removeButton();
    return;
  }

  showButton(selection!);
}

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
    z-index: 2147483647;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  `;

  floatBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content/floating-btn.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/floating-btn.ts tests/content/floating-btn.test.ts
git commit -m "feat: add floating translate button on text selection"
```

---

## Task 11: Translation Orchestrator

**Files:**
- Create: `src/content/translator.ts`, `tests/content/translator.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/content/translator.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationOrchestrator } from '@content/translator';

vi.mock('@shared/messaging', () => ({
  sendToBackground: vi.fn(),
  onMessage: vi.fn(),
}));

vi.mock('@content/renderer', () => ({
  renderTranslation: vi.fn(),
  renderLoading: vi.fn(),
  renderError: vi.fn(),
  removeTranslation: vi.fn(),
}));

import { sendToBackground } from '@shared/messaging';
import { renderLoading } from '@content/renderer';

describe('TranslationOrchestrator', () => {
  let orchestrator: TranslationOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new TranslationOrchestrator();
  });

  describe('translateParagraphs', () => {
    it('sends paragraphs to background for translation', () => {
      const paragraphs = [
        { id: 'p1', text: 'Hello world', element: document.createElement('p') },
        { id: 'p2', text: 'Another one', element: document.createElement('p') },
      ];

      orchestrator.translateParagraphs(paragraphs);

      expect(sendToBackground).toHaveBeenCalledWith({
        type: 'TRANSLATE_PARAGRAPHS',
        payload: { paragraphs: [{ id: 'p1', text: 'Hello world' }, { id: 'p2', text: 'Another one' }] },
      });
    });

    it('shows loading state for each paragraph', () => {
      const paragraphs = [
        { id: 'p1', text: 'Hello', element: document.createElement('p') },
      ];

      orchestrator.translateParagraphs(paragraphs);
      expect(renderLoading).toHaveBeenCalledWith('p1');
    });

    it('skips paragraphs already in queue', () => {
      const paragraphs = [
        { id: 'p1', text: 'Hello', element: document.createElement('p') },
      ];

      orchestrator.translateParagraphs(paragraphs);
      orchestrator.translateParagraphs(paragraphs);

      expect(sendToBackground).toHaveBeenCalledTimes(1);
    });
  });

  describe('translateSelection', () => {
    it('sends selection to background', () => {
      orchestrator.translateSelection('selected text');
      expect(sendToBackground).toHaveBeenCalledWith({
        type: 'TRANSLATE_SELECTION',
        payload: { text: 'selected text', id: expect.stringContaining('sel-') },
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/content/translator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement orchestrator**

`src/content/translator.ts`:
```typescript
import { sendToBackground } from '@shared/messaging';
import { renderLoading, renderTranslation, renderError } from './renderer';

export class TranslationOrchestrator {
  private pending = new Set<string>();
  private selectionCounter = 0;

  translateParagraphs(paragraphs: Array<{ id: string; text: string; element: Element }>): void {
    const newParagraphs = paragraphs.filter((p) => !this.pending.has(p.id));
    if (newParagraphs.length === 0) return;

    for (const p of newParagraphs) {
      this.pending.add(p.id);
      renderLoading(p.id);
    }

    sendToBackground({
      type: 'TRANSLATE_PARAGRAPHS',
      payload: { paragraphs: newParagraphs.map(({ id, text }) => ({ id, text })) },
    });
  }

  translateSelection(text: string): void {
    const id = `sel-${this.selectionCounter++}`;
    sendToBackground({
      type: 'TRANSLATE_SELECTION',
      payload: { text, id },
    });
  }

  handleResult(paragraphId: string, translated: string): void {
    this.pending.delete(paragraphId);
    renderTranslation(paragraphId, translated);
  }

  handleError(paragraphId: string, error: string): void {
    this.pending.delete(paragraphId);
    renderError(paragraphId, error);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/content/translator.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/translator.ts tests/content/translator.test.ts
git commit -m "feat: add translation orchestrator with queue and deduplication"
```

---

## Task 12: Content Script Entry Point

**Files:**
- Create: `src/content/index.ts`

- [ ] **Step 1: Implement content script entry**

`src/content/index.ts`:
```typescript
import { onMessage } from '@shared/messaging';
import { detectVisibleParagraphs, observeNewParagraphs } from './detector';
import { initFloatingButton } from './floating-btn';
import { TranslationOrchestrator } from './translator';
import type { MessageType } from '@shared/types';

const orchestrator = new TranslationOrchestrator();

function translateVisibleParagraphs(): void {
  const paragraphs = detectVisibleParagraphs();
  if (paragraphs.length > 0) {
    orchestrator.translateParagraphs(paragraphs);
  }
}

function handlePageTranslate(): void {
  translateVisibleParagraphs();

  let scrollTimeout: ReturnType<typeof setTimeout>;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(translateVisibleParagraphs, 200);
  });
}

initFloatingButton((text) => {
  orchestrator.translateSelection(text);
});

observeNewParagraphs(() => {
  translateVisibleParagraphs();
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
```

- [ ] **Step 2: Commit**

```bash
git add src/content/index.ts
git commit -m "feat: add content script entry with scroll-based progressive translation"
```

---

## Task 13: Service Worker (Background)

**Files:**
- Create: `src/background/index.ts`

- [ ] **Step 1: Implement service worker**

`src/background/index.ts`:
```typescript
import { DirectAPIProvider } from '@core/direct-api';
import { getSettings, getTerminology } from '@shared/storage';
import { mergeTermRecords } from '@core/terminology';
import type { MessageType, TermRecord } from '@shared/types';

const provider = new DirectAPIProvider();
let globalTermRecords: TermRecord[] = [];

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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'halftrans-translate-page') {
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_PAGE_TRANSLATE' } as MessageType);
  } else if (info.menuItemId === 'halftrans-translate-selection' && info.selectionText) {
    await translateAndRespond(tab.id, info.selectionText, `ctx-${Date.now()}`);
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

chrome.runtime.onMessage.addListener((message: MessageType, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (message.type === 'TRANSLATE_PARAGRAPHS') {
    for (const para of message.payload.paragraphs) {
      translateAndRespond(tabId, para.text, para.id);
    }
  } else if (message.type === 'TRANSLATE_SELECTION') {
    translateAndRespond(tabId, message.payload.text, message.payload.id);
  }
});

async function translateAndRespond(tabId: number, text: string, paragraphId: string): Promise<void> {
  try {
    const settings = await getSettings();

    if (!settings.apiKey) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TRANSLATION_ERROR',
        payload: { paragraphId, error: '请先在设置中配置 API Key' },
      } as MessageType);
      return;
    }

    const terminology = await getTerminology();

    const result = await provider.translate({
      text,
      paragraphId,
      settings,
      terminology,
      contextTerms: globalTermRecords,
    });

    globalTermRecords = mergeTermRecords(globalTermRecords, result.termsUsed);

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

- [ ] **Step 2: Commit**

```bash
git add src/background/index.ts
git commit -m "feat: add service worker with context menu, shortcuts, and translation coordination"
```

---

## Task 14: Popup UI

**Files:**
- Create: `src/popup/index.html`, `src/popup/main.tsx`, `src/popup/App.tsx`

- [ ] **Step 1: Create popup HTML entry**

`src/popup/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=300" />
  <title>HalfTrans</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create React entry**

`src/popup/main.tsx`:
```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../styles/tailwind.css';

createRoot(document.getElementById('root')!).render(<App />);
```

Create `src/styles/tailwind.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Implement Popup App**

`src/popup/App.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, getTerminology } from '@shared/storage';
import type { UserSettings, TranslationStyle, RetentionIntensity } from '@shared/types';
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

  return (
    <div className="w-72 p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-800">HalfTrans</h1>

      <button
        onClick={handleTranslatePage}
        className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
      >
        ▶ 翻译当前页
      </button>

      <div className="space-y-2">
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

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">保留强度</span>
          <select
            value={settings.intensity}
            onChange={(e) => updateSetting('intensity', e.target.value as RetentionIntensity)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="conservative">保守</option>
            <option value="aggressive">激进</option>
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

- [ ] **Step 4: Commit**

```bash
git add src/popup/ src/styles/tailwind.css
git commit -m "feat: add Popup panel with translate button, style/intensity controls"
```

---

## Task 15: Options Page UI

**Files:**
- Create: `src/options/index.html`, `src/options/main.tsx`, `src/options/App.tsx`

- [ ] **Step 1: Create options HTML entry**

`src/options/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HalfTrans 设置</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create React entry**

`src/options/main.tsx`:
```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../styles/tailwind.css';

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 3: Implement Options App**

`src/options/App.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, getTerminology, saveTerminology } from '@shared/storage';
import type { UserSettings, TermEntry } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [terms, setTerms] = useState<TermEntry[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
    getTerminology().then(setTerms);
  }, []);

  const handleSaveSettings = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">HalfTrans 设置</h1>

      {/* API Settings */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">API 配置</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-600">API Base URL</span>
            <input
              type="text"
              value={settings.apiBaseUrl}
              onChange={(e) => setSettings({ ...settings, apiBaseUrl: e.target.value })}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">API Key</span>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="sk-..."
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">模型</span>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="gpt-4o-mini"
            />
          </label>
        </div>
      </section>

      {/* Translation Settings */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">翻译设置</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">翻译风格</span>
            <select
              value={settings.style}
              onChange={(e) => setSettings({ ...settings, style: e.target.value as UserSettings['style'] })}
              className="mt-1 block w-full border rounded px-3 py-2"
            >
              <option value="colloquial">口语化</option>
              <option value="formal">书面化</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">术语保留强度</span>
            <select
              value={settings.intensity}
              onChange={(e) => setSettings({ ...settings, intensity: e.target.value as UserSettings['intensity'] })}
              className="mt-1 block w-full border rounded px-3 py-2"
            >
              <option value="conservative">保守（多保留英文）</option>
              <option value="aggressive">激进（尽量翻译）</option>
            </select>
          </label>
        </div>
      </section>

      {/* Terminology */}
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

      {/* Save */}
      <button
        onClick={handleSaveSettings}
        className="w-full py-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
      >
        {saved ? '✓ 已保存' : '保存设置'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/options/
git commit -m "feat: add Options page with API config, translation settings, and terminology editor"
```

---

## Task 16: Integration & Manual Testing

**Files:**
- Modify: `package.json` (verify scripts)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 2: Build the extension**

```bash
npm run build
```

Expected: Build succeeds, `dist/` directory created with all extension files.

- [ ] **Step 3: Load in Chrome and manually test**

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked" and select the `dist/` directory
4. Open any English webpage (e.g., https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop)
5. Test: right-click → "HalfTrans - 翻译全页" (need API key configured first)
6. Test: select text → floating button appears → click to translate
7. Test: `Ctrl+Shift+T` shortcut
8. Test: Popup panel opens with correct controls
9. Test: Options page — configure API key, add terminology

- [ ] **Step 4: Fix any issues found during manual testing**

Address build errors, runtime issues, or UI problems discovered.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: fix integration issues from manual testing"
```

---

## Task 17: Icons & Polish

**Files:**
- Create: `public/icons/icon16.png`, `public/icons/icon48.png`, `public/icons/icon128.png`

- [ ] **Step 1: Create placeholder icons**

Generate simple SVG-based icons (blue circle with "½" text) and convert to PNG at 16x16, 48x48, and 128x128 sizes. Place in `public/icons/`.

- [ ] **Step 2: Update manifest icon paths if needed**

Verify `src/manifest.json` icon paths resolve correctly after build.

- [ ] **Step 3: Final commit**

```bash
git add public/icons/ src/manifest.json
git commit -m "chore: add extension icons"
```
