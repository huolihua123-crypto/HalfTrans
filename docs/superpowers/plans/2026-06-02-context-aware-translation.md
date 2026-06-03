# Context-Aware Term Extraction Translation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text page strategy with structured LLM-powered term extraction and occurrence-level contextual annotation, eliminating over-retention of common English words.

**Architecture:** LLM extracts technical terms per page (cached 24h in chrome.storage.local). Translation prompt receives the term list and decides per-sentence whether each term is used technically (keep English) or generically (translate). User-configured terms always override.

**Tech Stack:** TypeScript, Vitest, Chrome Extension APIs (storage.local), OpenAI-compatible chat completions API.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/core/term-extractor.ts` | LLM call to extract structured term list from page context |
| Create | `src/core/term-cache.ts` | Persistent cache using chrome.storage.local with 24h TTL |
| Create | `tests/core/term-extractor.test.ts` | Tests for term extraction |
| Create | `tests/core/term-cache.test.ts` | Tests for persistent cache |
| Modify | `src/core/prompt.ts` | New buildSystemPrompt signature with extractedTerms |
| Modify | `src/core/direct-api.ts` | Adapt to new prompt interface |
| Modify | `src/shared/types.ts` | Add new types, remove intensity |
| Modify | `src/background/index.ts` | Wire up term extractor + cache |
| Modify | `src/options/App.tsx` | Remove intensity selector |
| Modify | `tests/core/prompt.test.ts` | Update for new signature |
| Modify | `tests/core/direct-api.test.ts` | Update for new interface |
| Delete | `src/core/strategy.ts` | Replaced by term-extractor |
| Delete | `src/core/strategy-cache.ts` | Replaced by term-cache |
| Delete | `tests/core/strategy.test.ts` | No longer needed |
| Delete | `tests/core/strategy-cache.test.ts` | No longer needed |

---

### Task 1: Update Types

**Files:**
- Modify: `halftrans/src/shared/types.ts`

- [ ] **Step 1: Add ExtractedTerms and CachedTermEntry types**

Add after the existing `PageContext` interface:

```typescript
export interface ExtractedTerms {
  domain: string;
  terms: string[];
}

export interface CachedTermEntry {
  domain: string;
  terms: string[];
  timestamp: number;
}
```

- [ ] **Step 2: Remove RetentionIntensity and update UserSettings**

Remove:

```typescript
export type RetentionIntensity = 'conservative' | 'aggressive';
```

Update `UserSettings` to remove `intensity`:

```typescript
export interface UserSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  style: TranslationStyle;
  shortcut: string;
}
```

Update `DEFAULT_SETTINGS`:

```typescript
export const DEFAULT_SETTINGS: UserSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  style: 'colloquial',
  shortcut: 'Ctrl+Shift+T',
};
```

- [ ] **Step 3: Update BatchTranslationRequest**

Replace `pageStrategy: string` with `extractedTerms: string[]`:

```typescript
export interface BatchTranslationRequest {
  paragraphs: Array<{ id: string; text: string }>;
  settings: UserSettings;
  terminology: TermEntry[];
  contextTerms: TermRecord[];
  extractedTerms: string[];
}
```

- [ ] **Step 4: Run type check to identify downstream breakages**

Run: `cd halftrans && npx tsc --noEmit 2>&1 | head -50`

Expected: Multiple type errors in prompt.ts, direct-api.ts, background/index.ts, options/App.tsx, and test files. This confirms the type changes propagate correctly.

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/shared/types.ts
git commit -m "refactor: update types for term extraction architecture"
```

---

### Task 2: Create Term Extractor

**Files:**
- Create: `halftrans/tests/core/term-extractor.test.ts`
- Create: `halftrans/src/core/term-extractor.ts`

- [ ] **Step 1: Write tests for term extractor**

Create `halftrans/tests/core/term-extractor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTerms, buildTermExtractionPrompt } from '@core/term-extractor';
import type { UserSettings } from '@shared/types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('term-extractor', () => {
  const settings: UserSettings = {
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    style: 'colloquial',
    shortcut: 'Ctrl+Shift+T',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('buildTermExtractionPrompt', () => {
    it('includes the page context', () => {
      const prompt = buildTermExtractionPrompt('页面标题: Rust Tokio Guide');
      expect(prompt).toContain('Rust Tokio Guide');
    });

    it('instructs to output JSON only', () => {
      const prompt = buildTermExtractionPrompt('some context');
      expect(prompt).toContain('JSON');
    });

    it('instructs to exclude common words with Chinese equivalents', () => {
      const prompt = buildTermExtractionPrompt('some context');
      expect(prompt).toContain('server');
      expect(prompt).toContain('request');
    });
  });

  describe('extractTerms', () => {
    it('parses valid JSON response into ExtractedTerms', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"domain": "backend", "terms": ["runtime", "future", "tokio"]}' } }],
        }),
      });

      const result = await extractTerms('context text', settings);
      expect(result.domain).toBe('backend');
      expect(result.terms).toEqual(['runtime', 'future', 'tokio']);
    });

    it('returns empty result on invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'This is not JSON at all' } }],
        }),
      });

      const result = await extractTerms('context text', settings);
      expect(result.domain).toBe('');
      expect(result.terms).toEqual([]);
    });

    it('returns empty result on API failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await extractTerms('context text', settings);
      expect(result.domain).toBe('');
      expect(result.terms).toEqual([]);
    });

    it('returns empty result on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network timeout'));

      const result = await extractTerms('context text', settings);
      expect(result.domain).toBe('');
      expect(result.terms).toEqual([]);
    });

    it('handles JSON wrapped in markdown code fence', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '```json\n{"domain": "frontend", "terms": ["React", "hook"]}\n```' } }],
        }),
      });

      const result = await extractTerms('context text', settings);
      expect(result.domain).toBe('frontend');
      expect(result.terms).toEqual(['React', 'hook']);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd halftrans && npx vitest run tests/core/term-extractor.test.ts`

Expected: FAIL — module `@core/term-extractor` not found.

- [ ] **Step 3: Implement term-extractor.ts**

Create `halftrans/src/core/term-extractor.ts`:

```typescript
import type { UserSettings, ExtractedTerms } from '@shared/types';

const EMPTY_RESULT: ExtractedTerms = { domain: '', terms: [] };

export function buildTermExtractionPrompt(contextText: string): string {
  return `根据以下网页信息，提取当前页面中作为专有技术概念使用的术语。

规则：
1. 只提取在当前技术领域中作为专有概念的词（如 runtime、Event Loop、Virtual DOM）
2. 不要包含有明确中文对应的通用词（如 server→服务器、request→请求、issue→问题）
3. 框架名、库名、专有 API 名应包含
4. 只输出 JSON，不要解释

网页信息：
${contextText}

输出格式：
{"domain": "...", "terms": ["...", "..."]}`;
}

export async function extractTerms(contextText: string, settings: UserSettings): Promise<ExtractedTerms> {
  try {
    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'user', content: buildTermExtractionPrompt(contextText) },
        ],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    if (!response.ok) return EMPTY_RESULT;

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    return parseTermResponse(content);
  } catch {
    return EMPTY_RESULT;
  }
}

function parseTermResponse(content: string): ExtractedTerms {
  let jsonStr = content;
  const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.domain === 'string' && Array.isArray(parsed.terms)) {
      return { domain: parsed.domain, terms: parsed.terms.filter((t: unknown) => typeof t === 'string') };
    }
    return EMPTY_RESULT;
  } catch {
    return EMPTY_RESULT;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/core/term-extractor.test.ts`

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/term-extractor.ts halftrans/tests/core/term-extractor.test.ts
git commit -m "feat: add LLM-powered term extractor with structured JSON output"
```

---

### Task 3: Create Persistent Term Cache

**Files:**
- Create: `halftrans/tests/core/term-cache.test.ts`
- Create: `halftrans/src/core/term-cache.ts`

- [ ] **Step 1: Write tests for term cache**

Create `halftrans/tests/core/term-cache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TermCache } from '@core/term-cache';

const mockStorage: Record<string, unknown> = {};

const chromeStorageMock = {
  local: {
    get: vi.fn((keys: string[] | null) => {
      if (keys === null) return Promise.resolve({ ...mockStorage });
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (mockStorage[key] !== undefined) {
          result[key] = mockStorage[key];
        }
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(mockStorage, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string[]) => {
      for (const key of keys) {
        delete mockStorage[key];
      }
      return Promise.resolve();
    }),
  },
};

vi.stubGlobal('chrome', { storage: chromeStorageMock });

describe('TermCache', () => {
  let cache: TermCache;

  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    vi.clearAllMocks();
    cache = new TermCache();
  });

  it('returns null for uncached URL', async () => {
    const result = await cache.get('https://example.com/page');
    expect(result).toBeNull();
  });

  it('stores and retrieves terms by URL', async () => {
    await cache.set('https://example.com/page', { domain: 'backend', terms: ['runtime'] });
    const result = await cache.get('https://example.com/page');
    expect(result).toEqual({ domain: 'backend', terms: ['runtime'] });
  });

  it('normalizes URLs by stripping query and hash', async () => {
    await cache.set('https://example.com/page', { domain: 'backend', terms: ['runtime'] });
    const result = await cache.get('https://example.com/page?foo=bar#section');
    expect(result).toEqual({ domain: 'backend', terms: ['runtime'] });
  });

  it('returns null for expired entries (24h TTL)', async () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    mockStorage['term-cache::https://example.com/page'] = {
      domain: 'backend',
      terms: ['runtime'],
      timestamp: twentyFiveHoursAgo,
    };

    const result = await cache.get('https://example.com/page');
    expect(result).toBeNull();
  });

  it('returns data for non-expired entries', async () => {
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
    mockStorage['term-cache::https://example.com/page'] = {
      domain: 'backend',
      terms: ['runtime'],
      timestamp: oneHourAgo,
    };

    const result = await cache.get('https://example.com/page');
    expect(result).toEqual({ domain: 'backend', terms: ['runtime'] });
  });

  it('clears all cache entries', async () => {
    await cache.set('https://example.com/a', { domain: 'a', terms: ['x'] });
    await cache.set('https://example.com/b', { domain: 'b', terms: ['y'] });
    await cache.clear();
    expect(chromeStorageMock.local.remove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd halftrans && npx vitest run tests/core/term-cache.test.ts`

Expected: FAIL — module `@core/term-cache` not found.

- [ ] **Step 3: Implement term-cache.ts**

Create `halftrans/src/core/term-cache.ts`:

```typescript
import type { ExtractedTerms, CachedTermEntry } from '@shared/types';

const TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'term-cache::';

export class TermCache {
  async get(url: string): Promise<ExtractedTerms | null> {
    const key = this.buildKey(url);
    const result = await chrome.storage.local.get([key]);
    const entry = result[key] as CachedTermEntry | undefined;

    if (!entry) return null;
    if (Date.now() - entry.timestamp > TTL_MS) {
      chrome.storage.local.remove([key]);
      return null;
    }

    return { domain: entry.domain, terms: entry.terms };
  }

  async set(url: string, data: ExtractedTerms): Promise<void> {
    const key = this.buildKey(url);
    const entry: CachedTermEntry = {
      domain: data.domain,
      terms: data.terms,
      timestamp: Date.now(),
    };
    await chrome.storage.local.set({ [key]: entry });
    this.cleanupExpired();
  }

  async clear(): Promise<void> {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX));
    if (keys.length > 0) {
      await chrome.storage.local.remove(keys);
    }
  }

  private buildKey(url: string): string {
    return `${KEY_PREFIX}${this.normalize(url)}`;
  }

  private normalize(url: string): string {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`;
    } catch {
      return url;
    }
  }

  private async cleanupExpired(): Promise<void> {
    const all = await chrome.storage.local.get(null);
    const expiredKeys: string[] = [];
    const now = Date.now();

    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(KEY_PREFIX)) continue;
      const entry = value as CachedTermEntry;
      if (now - entry.timestamp > TTL_MS) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      chrome.storage.local.remove(expiredKeys);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/core/term-cache.test.ts`

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/term-cache.ts halftrans/tests/core/term-cache.test.ts
git commit -m "feat: add persistent term cache with 24h TTL using chrome.storage.local"
```

---

### Task 4: Rewrite Prompt Builder

**Files:**
- Modify: `halftrans/src/core/prompt.ts`
- Modify: `halftrans/tests/core/prompt.test.ts`

- [ ] **Step 1: Rewrite prompt.test.ts**

Replace the entire content of `halftrans/tests/core/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from '@core/prompt';
import type { TermRecord } from '@shared/types';

describe('prompt', () => {
  describe('buildSystemPrompt', () => {
    it('includes style instruction for colloquial', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('口语化');
    });

    it('includes style instruction for formal', () => {
      const prompt = buildSystemPrompt('formal', [], []);
      expect(prompt).toContain('书面化');
    });

    it('includes extracted terms as reference', () => {
      const prompt = buildSystemPrompt('colloquial', [], ['runtime', 'future', 'tokio']);
      expect(prompt).toContain('runtime');
      expect(prompt).toContain('future');
      expect(prompt).toContain('tokio');
    });

    it('includes user keep-terms as unconditional preserve', () => {
      const terms: TermRecord[] = [{ term: 'Event Loop', kept: true }];
      const prompt = buildSystemPrompt('colloquial', terms, []);
      expect(prompt).toContain('Event Loop');
      expect(prompt).toContain('保留原文');
    });

    it('includes user translate-terms as unconditional translate', () => {
      const terms: TermRecord[] = [{ term: 'server', kept: false }];
      const prompt = buildSystemPrompt('colloquial', terms, []);
      expect(prompt).toContain('server');
      expect(prompt).toContain('翻译为中文');
    });

    it('includes context annotation instruction', () => {
      const prompt = buildSystemPrompt('colloquial', [], ['runtime']);
      expect(prompt).toContain('根据上下文判断');
    });

    it('includes default-translate rule for unmarked words', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('默认翻译为中文');
    });

    it('omits term reference section when no extracted terms', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).not.toContain('以下术语是当前页面的技术术语');
    });
  });

  describe('buildUserPrompt', () => {
    it('wraps text for translation', () => {
      const prompt = buildUserPrompt('The event loop runs callbacks.');
      expect(prompt).toContain('The event loop runs callbacks.');
    });
  });

  describe('buildBatchUserPrompt', () => {
    it('joins multiple texts with separator', () => {
      const texts = ['Hello world', 'Goodbye world'];
      const prompt = buildBatchUserPrompt(texts);
      expect(prompt).toContain('Hello world');
      expect(prompt).toContain('Goodbye world');
      expect(prompt).toContain('[SEP]');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd halftrans && npx vitest run tests/core/prompt.test.ts`

Expected: FAIL — buildSystemPrompt signature mismatch.

- [ ] **Step 3: Rewrite prompt.ts**

Replace the entire content of `halftrans/src/core/prompt.ts`:

```typescript
import type { TranslationStyle, TermRecord } from '@shared/types';

export function buildSystemPrompt(
  style: TranslationStyle,
  contextTerms: TermRecord[],
  extractedTerms: string[]
): string {
  const styleInstruction =
    style === 'colloquial'
      ? '翻译风格要口语化，自然流畅，像同事之间交流一样。'
      : '翻译风格要书面化，正式专业，适合文档阅读。';

  let termSection = '';
  if (extractedTerms.length > 0) {
    termSection = `\n3. 以下术语是当前页面的技术术语，但请根据每句话的具体语境决定是否保留：\n   ${extractedTerms.join(', ')}`;
  }

  let userTermSection = '';
  const keepTerms = contextTerms.filter((t) => t.kept).map((t) => t.term);
  const translateTerms = contextTerms.filter((t) => !t.kept).map((t) => t.term);

  if (keepTerms.length > 0) {
    userTermSection += `\n以下术语必须保留原文不翻译：${keepTerms.join('、')}`;
  }
  if (translateTerms.length > 0) {
    userTermSection += `\n以下术语必须翻译为中文：${translateTerms.join('、')}`;
  }

  return `你是一个专业的技术内容翻译助手。将英文翻译为中文，目标是最小化读者的认知成本。

规则：
1. ${styleInstruction}
2. 对于每个段落，根据上下文判断术语的使用方式：
   - 如果术语在当前句子中作为技术概念使用，保留英文
   - 如果术语在当前句子中作为普通含义使用，翻译为中文${termSection}${userTermSection}
4. 未被标记为术语的英文词汇，默认翻译为中文。
5. 只输出翻译结果，不要解释或添加额外内容。`;
}

export function buildUserPrompt(text: string): string {
  return `请翻译以下内容：\n\n${text}`;
}

export function buildBatchUserPrompt(texts: string[]): string {
  const joined = texts.map((t) => `[SEP]\n${t}`).join('\n');
  return `请翻译以下内容（每段用 [SEP] 分隔，按相同顺序输出翻译结果，同样用 [SEP] 分隔）：\n\n${joined}\n[SEP]`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/core/prompt.test.ts`

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/prompt.ts halftrans/tests/core/prompt.test.ts
git commit -m "refactor: rewrite prompt builder with extracted terms and context annotation"
```

---

### Task 5: Update DirectAPIProvider

**Files:**
- Modify: `halftrans/src/core/direct-api.ts`
- Modify: `halftrans/tests/core/direct-api.test.ts`

- [ ] **Step 1: Rewrite direct-api.test.ts**

Replace the entire content of `halftrans/tests/core/direct-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectAPIProvider } from '@core/direct-api';
import type { TranslationRequest, BatchTranslationRequest } from '@shared/types';

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
    const headers = JSON.parse(JSON.stringify(callArgs.headers));
    expect(headers['Authorization']).toBe('Bearer sk-test');
  });

  describe('translateBatch', () => {
    const batchRequest: BatchTranslationRequest = {
      paragraphs: [
        { id: 'p1', text: 'Our server encounters an issue.' },
        { id: 'p2', text: 'Please retry your request.' },
      ],
      settings: baseRequest.settings,
      terminology: [],
      contextTerms: [],
      extractedTerms: ['runtime', 'future'],
    };

    it('sends batch request and parses separated response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '[SEP]\n我们的服务器遇到了问题。\n[SEP]\n请重试您的请求。\n[SEP]' } }],
        }),
      });

      const result = await provider.translateBatch(batchRequest);
      expect(result.results.length).toBe(2);
      expect(result.results[0].paragraphId).toBe('p1');
      expect(result.results[0].translated).toBe('我们的服务器遇到了问题。');
      expect(result.results[1].paragraphId).toBe('p2');
      expect(result.results[1].translated).toBe('请重试您的请求。');
    });

    it('includes extracted terms in system prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '[SEP]\ntranslated1\n[SEP]\ntranslated2\n[SEP]' } }],
        }),
      });

      await provider.translateBatch(batchRequest);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('runtime');
      expect(body.messages[0].content).toContain('future');
    });

    it('falls back to individual translation when separator count mismatches', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '我们的服务器遇到了问题。请重试。' } }],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '我们的服务器遇到了问题。' } }],
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '请重试您的请求。' } }],
        }),
      });

      const result = await provider.translateBatch(batchRequest);
      expect(result.results.length).toBe(2);
      expect(result.results[0].translated).toBe('我们的服务器遇到了问题。');
      expect(result.results[1].translated).toBe('请重试您的请求。');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(provider.translateBatch(batchRequest)).rejects.toThrow('API error: 500');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd halftrans && npx vitest run tests/core/direct-api.test.ts`

Expected: FAIL — type errors from new interface.

- [ ] **Step 3: Rewrite direct-api.ts**

Replace the entire content of `halftrans/src/core/direct-api.ts`:

```typescript
import type { TranslationProvider } from './provider';
import type { TranslationRequest, TranslationResult, BatchTranslationRequest, BatchTranslationResult } from '@shared/types';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from './prompt';
import { buildTermContext } from './terminology';

export class DirectAPIProvider implements TranslationProvider {
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, paragraphId, settings, terminology, contextTerms } = request;

    const detectedTerms = buildTermContext(terminology, text);
    const allTerms = [...contextTerms, ...detectedTerms];

    const systemPrompt = buildSystemPrompt(settings.style, allTerms, []);
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

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
    const { paragraphs, settings, terminology, contextTerms, extractedTerms } = request;

    const allTerms = [...contextTerms];
    for (const p of paragraphs) {
      const detected = buildTermContext(terminology, p.text);
      for (const t of detected) {
        if (!allTerms.some((e) => e.term.toLowerCase() === t.term.toLowerCase())) {
          allTerms.push(t);
        }
      }
    }

    const systemPrompt = buildSystemPrompt(settings.style, allTerms, extractedTerms);
    const userPrompt = buildBatchUserPrompt(paragraphs.map((p) => p.text));

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
    const content = data.choices[0].message.content.trim();

    const parsed = this.parseBatchResponse(content, paragraphs.length);

    if (parsed.length === paragraphs.length) {
      return {
        results: paragraphs.map((p, i) => ({
          paragraphId: p.id,
          original: p.text,
          translated: parsed[i],
          termsUsed: allTerms,
        })),
      };
    }

    const results: TranslationResult[] = [];
    for (const p of paragraphs) {
      const result = await this.translate({
        text: p.text,
        paragraphId: p.id,
        settings,
        terminology,
        contextTerms,
      });
      results.push(result);
    }
    return { results };
  }

  private parseBatchResponse(content: string, expectedCount: number): string[] {
    const parts = content.split('[SEP]').map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === expectedCount) {
      return parts;
    }
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/core/direct-api.test.ts`

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/direct-api.ts halftrans/tests/core/direct-api.test.ts
git commit -m "refactor: update DirectAPIProvider to use extracted terms instead of page strategy"
```

---

### Task 6: Wire Up Background Script

**Files:**
- Modify: `halftrans/src/background/index.ts`

- [ ] **Step 1: Rewrite background/index.ts**

Replace the entire content of `halftrans/src/background/index.ts`:

```typescript
import { DirectAPIProvider } from '@core/direct-api';
import { extractTerms } from '@core/term-extractor';
import { TermCache } from '@core/term-cache';
import { serializeContext } from '@core/context-serializer';
import { getSettings, getTerminology } from '@shared/storage';
import { buildTermContext, mergeTermRecords } from '@core/terminology';
import type { MessageType, PageContext, TermRecord, ExtractedTerms } from '@shared/types';

const provider = new DirectAPIProvider();
const termCache = new TermCache();
let globalTermRecords: TermRecord[] = [];

const BATCH_SIZE = 8;

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
    await translateSingle(tab.id, info.selectionText, `ctx-${Date.now()}`);
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
    translateBatch(tabId, message.payload.paragraphs, message.payload.pageContext);
  } else if (message.type === 'TRANSLATE_SELECTION') {
    translateSingle(tabId, message.payload.text, message.payload.id);
  }
});

async function getOrExtractTerms(pageContext: PageContext | undefined): Promise<ExtractedTerms | null> {
  if (!pageContext) return null;

  const url = pageContext.url;
  const cached = await termCache.get(url);
  if (cached) return cached;

  const settings = await getSettings();
  if (!settings.apiKey) return null;

  const contextText = serializeContext(pageContext);
  const extracted = await extractTerms(contextText, settings);
  if (extracted.terms.length > 0) {
    await termCache.set(url, extracted);
  }
  return extracted;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function translateBatch(
  tabId: number,
  paragraphs: Array<{ id: string; text: string }>,
  pageContext?: PageContext
): Promise<void> {
  try {
    const settings = await getSettings();

    if (!settings.apiKey) {
      for (const p of paragraphs) {
        chrome.tabs.sendMessage(tabId, {
          type: 'TRANSLATION_ERROR',
          payload: { paragraphId: p.id, error: '请先在设置中配置 API Key' },
        } as MessageType);
      }
      return;
    }

    const terminology = await getTerminology();

    const toTranslate = paragraphs.filter((p) => {
      const trimmed = p.text.trim().toLowerCase();
      return !terminology.some((t) => t.keep && t.term.toLowerCase() === trimmed);
    });

    const skipped = paragraphs.filter((p) => !toTranslate.includes(p));
    for (const p of skipped) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TRANSLATION_RESULT',
        payload: { paragraphId: p.id, original: p.text, translated: '', termsUsed: [] },
      } as MessageType);
    }

    if (toTranslate.length === 0) return;

    const extracted = await getOrExtractTerms(pageContext);
    const extractedTerms = extracted?.terms ?? [];

    const batches = chunk(toTranslate, BATCH_SIZE);

    for (const batch of batches) {
      const result = await provider.translateBatch({
        paragraphs: batch,
        settings,
        terminology,
        contextTerms: globalTermRecords,
        extractedTerms,
      });

      for (const r of result.results) {
        globalTermRecords = mergeTermRecords(globalTermRecords, r.termsUsed);
        chrome.tabs.sendMessage(tabId, {
          type: 'TRANSLATION_RESULT',
          payload: r,
        } as MessageType);
      }
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

async function translateSingle(tabId: number, text: string, paragraphId: string): Promise<void> {
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

    const trimmedText = text.trim().toLowerCase();
    const isCustomTerm = terminology.some(
      (t) => t.keep && t.term.toLowerCase() === trimmedText
    );
    if (isCustomTerm) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TRANSLATION_RESULT',
        payload: { paragraphId, original: text, translated: '', termsUsed: [] },
      } as MessageType);
      return;
    }

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

- [ ] **Step 2: Run type check**

Run: `cd halftrans && npx tsc --noEmit 2>&1 | head -20`

Expected: Errors only in `options/App.tsx` (intensity reference) — fixed in next task.

- [ ] **Step 3: Commit**

```bash
git add halftrans/src/background/index.ts
git commit -m "refactor: wire up term extractor and cache in background script"
```

---

### Task 7: Update Options Page

**Files:**
- Modify: `halftrans/src/options/App.tsx`

- [ ] **Step 1: Remove intensity selector from Options page**

In `halftrans/src/options/App.tsx`, find and delete this entire `<label>` block:

```tsx
<label className="block">
  <span className="text-sm text-gray-600">术语保留强度</span>
  <select
    value={settings.intensity}
    onChange={(e) => setSettings({ ...settings, intensity: e.target.value as UserSettings['intensity'] })}
    className="mt-1 block w-full border rounded px-3 py-2"
  >
    <option value="conservative">保守（多保留英文）</option>
    <option value="aggressive">积极（多翻译为中文）</option>
  </select>
</label>
```

- [ ] **Step 2: Run type check to verify**

Run: `cd halftrans && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add halftrans/src/options/App.tsx
git commit -m "refactor: remove intensity selector from options page"
```

---

### Task 8: Delete Old Strategy Modules

**Files:**
- Delete: `halftrans/src/core/strategy.ts`
- Delete: `halftrans/src/core/strategy-cache.ts`
- Delete: `halftrans/tests/core/strategy.test.ts`
- Delete: `halftrans/tests/core/strategy-cache.test.ts`

- [ ] **Step 1: Delete strategy files**

```bash
cd halftrans && rm src/core/strategy.ts src/core/strategy-cache.ts tests/core/strategy.test.ts tests/core/strategy-cache.test.ts
```

- [ ] **Step 2: Run full test suite**

Run: `cd halftrans && npx vitest run`

Expected: All remaining tests PASS. No import errors.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "chore: remove old strategy and strategy-cache modules"
```

---

### Task 9: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

Run: `cd halftrans && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `cd halftrans && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 3: Run build**

Run: `cd halftrans && npm run build`

Expected: Build completes successfully.
