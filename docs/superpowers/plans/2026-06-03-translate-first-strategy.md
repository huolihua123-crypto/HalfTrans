# Translate-First Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "model decides what to keep" translation strategy with a "translate everything, only whitelist stays English" strategy to eliminate false positives and improve naturalness.

**Architecture:** Simplify the translation pipeline by removing the TermRecord global state mechanism, tightening the term extraction prompt to only extract proper nouns, and rewriting the translation prompt to unconditionally translate everything except a closed whitelist.

**Tech Stack:** TypeScript, Vitest, Chrome Extension APIs, OpenAI-compatible Chat Completions API

---

### Task 1: Simplify Types

**Files:**
- Modify: `halftrans/src/shared/types.ts`
- Test: `halftrans/tests/core/prompt.test.ts` (will be updated in later tasks)

- [ ] **Step 1: Update ExtractedTerms to remove domain**

In `halftrans/src/shared/types.ts`, change:

```typescript
export interface ExtractedTerms {
  terms: string[];
}
```

- [ ] **Step 2: Replace BatchTranslationRequest with simplified version**

```typescript
export interface BatchTranslationRequest {
  paragraphs: Array<{ id: string; text: string }>;
  settings: UserSettings;
  keepTerms: string[];
  forceTranslateTerms: string[];
}
```

- [ ] **Step 3: Remove TermRecord type**

Delete the `TermRecord` interface entirely:

```typescript
// DELETE:
// export interface TermRecord {
//   term: string;
//   kept: boolean;
// }
```

- [ ] **Step 4: Simplify TranslationRequest**

```typescript
export interface TranslationRequest {
  text: string;
  paragraphId: string;
  settings: UserSettings;
  keepTerms: string[];
  forceTranslateTerms: string[];
}
```

- [ ] **Step 5: Simplify TranslationResult**

```typescript
export interface TranslationResult {
  paragraphId: string;
  original: string;
  translated: string;
}
```

- [ ] **Step 6: Simplify CachedTermEntry to remove domain**

```typescript
export interface CachedTermEntry {
  terms: string[];
  timestamp: number;
}
```

- [ ] **Step 7: Commit**

```bash
git add halftrans/src/shared/types.ts
git commit -m "refactor: simplify types for translate-first strategy"
```

---

### Task 2: Rewrite Term Extraction

**Files:**
- Modify: `halftrans/src/core/term-extractor.ts`
- Modify: `halftrans/tests/core/term-extractor.test.ts`

- [ ] **Step 1: Write updated tests**

Replace `halftrans/tests/core/term-extractor.test.ts` with:

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

    it('includes positive examples of proper nouns', () => {
      const prompt = buildTermExtractionPrompt('some context');
      expect(prompt).toContain('React');
      expect(prompt).toContain('Kubernetes');
      expect(prompt).toContain('Docker');
    });

    it('includes negative examples that must not be extracted', () => {
      const prompt = buildTermExtractionPrompt('some context');
      expect(prompt).toContain('server');
      expect(prompt).toContain('request');
      expect(prompt).toContain('runtime');
    });

    it('requires proper noun criteria', () => {
      const prompt = buildTermExtractionPrompt('some context');
      expect(prompt).toContain('产品');
      expect(prompt).toContain('框架');
    });
  });

  describe('extractTerms', () => {
    it('parses valid JSON response into terms array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"terms": ["Tokio", "React"]}' } }],
        }),
      });

      const result = await extractTerms('context text', settings);
      expect(result.terms).toEqual(['Tokio', 'React']);
    });

    it('returns empty result on invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'This is not JSON at all' } }],
        }),
      });

      const result = await extractTerms('context text', settings);
      expect(result.terms).toEqual([]);
    });

    it('returns empty result on API failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await extractTerms('context text', settings);
      expect(result.terms).toEqual([]);
    });

    it('returns empty result on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network timeout'));

      const result = await extractTerms('context text', settings);
      expect(result.terms).toEqual([]);
    });

    it('handles JSON wrapped in markdown code fence', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '```json\n{"terms": ["React", "Vue"]}\n```' } }],
        }),
      });

      const result = await extractTerms('context text', settings);
      expect(result.terms).toEqual(['React', 'Vue']);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd halftrans && npx vitest run tests/core/term-extractor.test.ts`
Expected: FAIL (type mismatches, old response format)

- [ ] **Step 3: Rewrite term-extractor.ts**

Replace `halftrans/src/core/term-extractor.ts` with:

```typescript
import type { UserSettings, ExtractedTerms } from '@shared/types';

const EMPTY_RESULT: ExtractedTerms = { terms: [] };

export function buildTermExtractionPrompt(contextText: string): string {
  return `根据以下网页信息，提取需要保留英文原文的专有名词。

入选标准（必须同时满足）：
1. 是某个具体产品、框架、库、协议或工具的名称
2. 在中文技术社区中没有通用的中文叫法
3. 翻译为中文后读者无法识别其所指

符合的例子：React, Kubernetes, Docker, gRPC, WebSocket, Nginx
不符合的例子：server（服务器）, request（请求）, runtime（运行时）, thread（线程）, function（函数）

只输出 JSON，不要解释。

网页信息：
${contextText}

输出格式：
{"terms": ["...", "..."]}`;
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
        max_tokens: 200,
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
    if (Array.isArray(parsed.terms)) {
      return { terms: parsed.terms.filter((t: unknown) => typeof t === 'string') };
    }
    return EMPTY_RESULT;
  } catch {
    return EMPTY_RESULT;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/core/term-extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/term-extractor.ts halftrans/tests/core/term-extractor.test.ts
git commit -m "refactor: tighten term extraction to proper nouns only"
```

---

### Task 3: Rewrite Translation Prompt

**Files:**
- Modify: `halftrans/src/core/prompt.ts`
- Modify: `halftrans/tests/core/prompt.test.ts`

- [ ] **Step 1: Write updated tests**

Replace `halftrans/tests/core/prompt.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from '@core/prompt';
import type { TranslationStyle } from '@shared/types';

describe('prompt', () => {
  describe('buildSystemPrompt', () => {
    it('includes colloquial style instruction', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('口语化');
    });

    it('includes formal style instruction', () => {
      const prompt = buildSystemPrompt('formal', [], []);
      expect(prompt).toContain('书面化');
    });

    it('includes whitelist terms as the only preserved words', () => {
      const prompt = buildSystemPrompt('colloquial', ['React', 'Vue'], []);
      expect(prompt).toContain('React');
      expect(prompt).toContain('Vue');
      expect(prompt).toContain('只有以下专有名词保留英文');
    });

    it('states all other words must be translated', () => {
      const prompt = buildSystemPrompt('colloquial', ['React'], []);
      expect(prompt).toContain('所有英文内容翻译为');
      expect(prompt).toContain('都必须翻译为中文');
    });

    it('includes explicit anti-examples for common false positives', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('server');
      expect(prompt).toContain('request');
      expect(prompt).toContain('issue');
    });

    it('includes user-forced translation terms in anti-examples', () => {
      const prompt = buildSystemPrompt('colloquial', [], ['middleware', 'handler']);
      expect(prompt).toContain('middleware');
      expect(prompt).toContain('handler');
    });

    it('handles empty whitelist gracefully', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('所有英文内容翻译为');
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
Expected: FAIL (signature mismatch, old prompt content)

- [ ] **Step 3: Rewrite prompt.ts**

Replace `halftrans/src/core/prompt.ts` with:

```typescript
import type { TranslationStyle } from '@shared/types';

export function buildSystemPrompt(
  style: TranslationStyle,
  keepTerms: string[],
  forceTranslateTerms: string[]
): string {
  const styleInstruction =
    style === 'colloquial'
      ? '翻译风格要口语化，自然流畅，像同事之间交流一样。'
      : '翻译风格要书面化，正式专业，适合文档阅读。';

  let keepSection = '';
  if (keepTerms.length > 0) {
    keepSection = `\n2. 只有以下专有名词保留英文原文不翻译：${keepTerms.join(', ')}`;
  } else {
    keepSection = '\n2. 没有需要保留英文的专有名词，全部翻译为中文。';
  }

  const defaultAntiExamples = ['server', 'request', 'issue', 'service', 'response'];
  const allAntiExamples = [...new Set([...defaultAntiExamples, ...forceTranslateTerms])];
  const antiSection = `\n3. 除上述列表外，所有英文词汇都必须翻译为中文，包括 ${allAntiExamples.join('、')} 等常见技术词汇。`;

  return `你是一个专业的中文技术内容翻译助手。

核心规则：
1. 将所有英文内容翻译为自然流畅的中文。${keepSection}${antiSection}
4. ${styleInstruction}
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
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/prompt.ts halftrans/tests/core/prompt.test.ts
git commit -m "refactor: rewrite translation prompt for translate-first strategy"
```

---

### Task 4: Simplify DirectAPIProvider

**Files:**
- Modify: `halftrans/src/core/direct-api.ts`
- Modify: `halftrans/src/core/provider.ts`
- Modify: `halftrans/tests/core/direct-api.test.ts`

- [ ] **Step 1: Write updated tests**

Replace `halftrans/tests/core/direct-api.test.ts` with:

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
    keepTerms: ['React'],
    forceTranslateTerms: [],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('calls the correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '事件循环处理回调。' } }],
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
        choices: [{ message: { content: '事件循环处理回调。' } }],
      }),
    });

    const result = await provider.translate(baseRequest);
    expect(result.translated).toBe('事件循环处理回调。');
    expect(result.paragraphId).toBe('p1');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(provider.translate(baseRequest)).rejects.toThrow('API error: 401');
  });

  it('includes keepTerms in system prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'translated' } }],
      }),
    });

    await provider.translate(baseRequest);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('React');
  });

  describe('translateBatch', () => {
    const batchRequest: BatchTranslationRequest = {
      paragraphs: [
        { id: 'p1', text: 'Our server encounters an issue.' },
        { id: 'p2', text: 'Please retry your request.' },
      ],
      settings: baseRequest.settings,
      keepTerms: ['Tokio'],
      forceTranslateTerms: [],
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

    it('includes keepTerms in system prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '[SEP]\ntranslated1\n[SEP]\ntranslated2\n[SEP]' } }],
        }),
      });

      await provider.translateBatch(batchRequest);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('Tokio');
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
Expected: FAIL

- [ ] **Step 3: Rewrite provider.ts**

Replace `halftrans/src/core/provider.ts` with:

```typescript
import type { TranslationRequest, TranslationResult } from '@shared/types';

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
```

- [ ] **Step 4: Rewrite direct-api.ts**

Replace `halftrans/src/core/direct-api.ts` with:

```typescript
import type { TranslationProvider } from './provider';
import type { TranslationRequest, TranslationResult, BatchTranslationRequest, BatchTranslationResult } from '@shared/types';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from './prompt';

export class DirectAPIProvider implements TranslationProvider {
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, paragraphId, settings, keepTerms, forceTranslateTerms } = request;

    const systemPrompt = buildSystemPrompt(settings.style, keepTerms, forceTranslateTerms);
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

    return { paragraphId, original: text, translated };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
    const { paragraphs, settings, keepTerms, forceTranslateTerms } = request;

    const systemPrompt = buildSystemPrompt(settings.style, keepTerms, forceTranslateTerms);
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
        })),
      };
    }

    const results: TranslationResult[] = [];
    for (const p of paragraphs) {
      const result = await this.translate({
        text: p.text,
        paragraphId: p.id,
        settings,
        keepTerms,
        forceTranslateTerms,
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/core/direct-api.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add halftrans/src/core/direct-api.ts halftrans/src/core/provider.ts halftrans/tests/core/direct-api.test.ts
git commit -m "refactor: simplify DirectAPIProvider for translate-first strategy"
```

---

### Task 5: Remove Terminology Module

**Files:**
- Delete: `halftrans/src/core/terminology.ts`
- Delete: `halftrans/tests/core/terminology.test.ts`

- [ ] **Step 1: Delete terminology.ts**

```bash
rm halftrans/src/core/terminology.ts
```

- [ ] **Step 2: Delete terminology test**

```bash
rm halftrans/tests/core/terminology.test.ts
```

- [ ] **Step 3: Verify no other files import from terminology**

Run: `grep -r "from.*terminology" halftrans/src/ --include="*.ts"`
Expected: Only `background/index.ts` (will be fixed in Task 6)

- [ ] **Step 4: Commit**

```bash
git add -A halftrans/src/core/terminology.ts halftrans/tests/core/terminology.test.ts
git commit -m "refactor: remove terminology module (no longer needed)"
```

---

### Task 6: Update Term Cache

**Files:**
- Modify: `halftrans/src/core/term-cache.ts`
- Modify: `halftrans/tests/core/term-cache.test.ts`

- [ ] **Step 1: Update term-cache.ts to remove domain**

Replace `halftrans/src/core/term-cache.ts` with:

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

    return { terms: entry.terms };
  }

  async set(url: string, data: ExtractedTerms): Promise<void> {
    const key = this.buildKey(url);
    const entry: CachedTermEntry = {
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

- [ ] **Step 2: Run term-cache tests**

Run: `cd halftrans && npx vitest run tests/core/term-cache.test.ts`
Expected: PASS (tests should still work since they test get/set/clear behavior)

If tests fail due to domain field assertions, update the test to remove domain references.

- [ ] **Step 3: Commit**

```bash
git add halftrans/src/core/term-cache.ts halftrans/tests/core/term-cache.test.ts
git commit -m "refactor: simplify term cache to remove domain field"
```

---

### Task 7: Rewrite Background Script

**Files:**
- Modify: `halftrans/src/background/index.ts`

- [ ] **Step 1: Rewrite background/index.ts**

Replace `halftrans/src/background/index.ts` with:

```typescript
import { DirectAPIProvider } from '@core/direct-api';
import { extractTerms } from '@core/term-extractor';
import { TermCache } from '@core/term-cache';
import { serializeContext } from '@core/context-serializer';
import { getSettings, getTerminology } from '@shared/storage';
import type { MessageType, PageContext, ExtractedTerms } from '@shared/types';

const provider = new DirectAPIProvider();
const termCache = new TermCache();

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

async function buildKeepTerms(pageContext: PageContext | undefined): Promise<string[]> {
  const terminology = await getTerminology();
  const userKeepTerms = terminology.filter((t) => t.keep).map((t) => t.term);

  const extracted = await getOrExtractTerms(pageContext);
  const extractedTerms = extracted?.terms ?? [];

  return [...new Set([...userKeepTerms, ...extractedTerms])];
}

async function getForceTranslateTerms(): Promise<string[]> {
  const terminology = await getTerminology();
  return terminology.filter((t) => !t.keep).map((t) => t.term);
}

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

    const keepTerms = await buildKeepTerms(pageContext);
    const forceTranslateTerms = await getForceTranslateTerms();

    const batches = chunk(paragraphs, BATCH_SIZE);

    for (const batch of batches) {
      const result = await provider.translateBatch({
        paragraphs: batch,
        settings,
        keepTerms,
        forceTranslateTerms,
      });

      for (const r of result.results) {
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
    const userKeepTerms = terminology.filter((t) => t.keep).map((t) => t.term);
    const forceTranslateTerms = terminology.filter((t) => !t.keep).map((t) => t.term);

    const result = await provider.translate({
      text,
      paragraphId,
      settings,
      keepTerms: userKeepTerms,
      forceTranslateTerms,
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd halftrans && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add halftrans/src/background/index.ts
git commit -m "refactor: simplify background script for translate-first strategy"
```

---

### Task 8: Update Content Script (TranslationOrchestrator)

**Files:**
- Modify: `halftrans/src/content/translator.ts`
- Modify: `halftrans/tests/content/translator.test.ts`

- [ ] **Step 1: Update translator.ts to remove termsUsed handling**

Replace `halftrans/src/content/translator.ts` with:

```typescript
import { sendToBackground } from '@shared/messaging';
import { renderLoading, renderTranslation, renderError, markSkipped } from './renderer';
import { showSelectionPopup } from './selection-popup';
import type { PageContext } from '@shared/types';

export class TranslationOrchestrator {
  private pending = new Map<string, string>();
  private selectionCounter = 0;
  private pageContext: PageContext | undefined;
  private selectionIds = new Set<string>();

  setPageContext(context: PageContext): void {
    this.pageContext = context;
  }

  translateParagraphs(paragraphs: Array<{ id: string; text: string; element: Element }>): void {
    const newParagraphs = paragraphs.filter((p) => !this.pending.has(p.id));
    if (newParagraphs.length === 0) return;

    for (const p of newParagraphs) {
      this.pending.set(p.id, p.text);
      renderLoading(p.id);
    }

    sendToBackground({
      type: 'TRANSLATE_PARAGRAPHS',
      payload: {
        paragraphs: newParagraphs.map(({ id, text }) => ({ id, text })),
        pageContext: this.pageContext,
      },
    });
  }

  translateSelection(text: string): void {
    const id = `sel-${this.selectionCounter++}`;
    this.selectionIds.add(id);
    sendToBackground({
      type: 'TRANSLATE_SELECTION',
      payload: { text, id },
    });
  }

  handleResult(paragraphId: string, translated: string): void {
    if (this.selectionIds.has(paragraphId)) {
      this.selectionIds.delete(paragraphId);
      if (translated) {
        showSelectionPopup(translated);
      }
      return;
    }

    const original = this.pending.get(paragraphId) ?? '';
    this.pending.delete(paragraphId);
    if (!translated || translated.trim() === original.trim()) {
      markSkipped(paragraphId);
      return;
    }
    renderTranslation(paragraphId, translated);
  }

  handleError(paragraphId: string, error: string): void {
    if (this.selectionIds.has(paragraphId)) {
      this.selectionIds.delete(paragraphId);
      showSelectionPopup(`翻译失败：${error}`);
      return;
    }

    this.pending.delete(paragraphId);
    renderError(paragraphId, error);
  }
}
```

- [ ] **Step 2: Update translator test to remove termsUsed references**

Check `halftrans/tests/content/translator.test.ts` for any references to `termsUsed` and remove them. The `TranslationResult` payload in the test's mocked messages should no longer include `termsUsed`.

- [ ] **Step 3: Run tests**

Run: `cd halftrans && npx vitest run tests/content/translator.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add halftrans/src/content/translator.ts halftrans/tests/content/translator.test.ts
git commit -m "refactor: remove termsUsed from TranslationOrchestrator"
```

---

### Task 9: Run Full Test Suite and Fix Remaining Issues

**Files:**
- Any remaining files with compilation or test errors

- [ ] **Step 1: Run TypeScript compiler**

Run: `cd halftrans && npx tsc --noEmit`
Expected: No errors. If errors, fix type references in remaining files.

- [ ] **Step 2: Run full test suite**

Run: `cd halftrans && npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Fix any remaining test failures**

Common issues to check:
- `storage.test.ts` may reference `TermRecord` — remove
- `messaging.test.ts` may reference old message payload shapes — update
- Any import of deleted `terminology` module — remove

- [ ] **Step 4: Run tests again to confirm all pass**

Run: `cd halftrans && npx vitest run`
Expected: All tests pass with no failures.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve remaining type and test issues after strategy refactor"
```

---

### Task 10: Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

Run: `cd halftrans && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify the built extension loads**

Check that the `dist/` output contains `manifest.json`, content scripts, and background script.

- [ ] **Step 3: Final commit if build required changes**

If build revealed issues, fix and commit:

```bash
git add -A
git commit -m "fix: resolve build issues"
```
