# Context-First Translation Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI term-extraction pipeline with a context-first single-LLM-call architecture that produces better translations with less latency.

**Architecture:** Delete term-extractor, terminology utils, and global term state. Add a DOM-based context-builder (content script), a static strong-terms dictionary, and rewrite the prompt to embody translate-role.md rules. The translation flow becomes: collect DOM context → build three-layer prompt → single LLM call → render.

**Tech Stack:** TypeScript, Vitest, Chrome Extension APIs (content script + background service worker), OpenAI-compatible chat completions API.

---

## File Structure

**Create:**
- `halftrans/src/core/strong-terms.ts` — static strong term dictionary (~80 terms)
- `halftrans/src/content/context-builder.ts` — DOM context collection (page + paragraph level)
- `halftrans/tests/core/strong-terms.test.ts`
- `halftrans/tests/content/context-builder.test.ts`

**Modify:**
- `halftrans/src/shared/types.ts` — add `TranslationContext`, simplify `TranslationResult`, update `MessageType`, remove dead types
- `halftrans/src/core/prompt.ts` — complete rewrite with three-layer system
- `halftrans/src/core/direct-api.ts` — simplify to accept `TranslationContext`
- `halftrans/src/core/provider.ts` — update interface signature
- `halftrans/src/content/translator.ts` — pass `TranslationContext` per batch
- `halftrans/src/content/index.ts` — use context-builder, remove context-extractor import
- `halftrans/src/background/index.ts` — remove term pipeline, simplify to single-call flow
- `halftrans/tests/core/prompt.test.ts` — rewrite for new prompt structure
- `halftrans/tests/core/direct-api.test.ts` — update for new request shape
- `halftrans/tests/content/translator.test.ts` — update for new flow

**Delete:**
- `halftrans/src/core/term-extractor.ts`
- `halftrans/src/core/terminology.ts`
- `halftrans/src/core/context-serializer.ts`
- `halftrans/src/core/term-cache.ts`
- `halftrans/tests/core/term-extractor.test.ts`
- `halftrans/tests/core/terminology.test.ts`
- `halftrans/tests/core/term-cache.test.ts`
- `halftrans/tests/content/context-extractor.test.ts`

---

### Task 1: Update Types

**Files:**
- Modify: `halftrans/src/shared/types.ts`

- [ ] **Step 1: Rewrite types.ts**

Replace the full contents of `halftrans/src/shared/types.ts` with:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles (expect errors in dependent files)**

Run: `cd halftrans && npx tsc --noEmit 2>&1 | head -30`

Expected: Errors in `direct-api.ts`, `background/index.ts`, `terminology.ts`, `term-extractor.ts`, etc. — these files reference deleted types. This is expected; we'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add halftrans/src/shared/types.ts
git commit -m "refactor: simplify types for context-first architecture"
```

---

### Task 2: Create Strong Terms Dictionary

**Files:**
- Create: `halftrans/src/core/strong-terms.ts`
- Create: `halftrans/tests/core/strong-terms.test.ts`

- [ ] **Step 1: Write the test**

Create `halftrans/tests/core/strong-terms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { STRONG_TERMS, getStrongTermsList } from '@core/strong-terms';

describe('strong-terms', () => {
  it('exports a non-empty array of terms', () => {
    expect(STRONG_TERMS.length).toBeGreaterThan(40);
  });

  it('each term has a non-empty string', () => {
    for (const entry of STRONG_TERMS) {
      expect(entry.term.length).toBeGreaterThan(0);
    }
  });

  it('getStrongTermsList returns comma-separated string', () => {
    const list = getStrongTermsList();
    expect(list).toContain('event loop');
    expect(list).toContain('callback');
    expect(list).toContain(',');
  });

  it('does not contain common words that should be translated', () => {
    const terms = STRONG_TERMS.map((t) => t.term.toLowerCase());
    expect(terms).not.toContain('server');
    expect(terms).not.toContain('request');
    expect(terms).not.toContain('response');
    expect(terms).not.toContain('issue');
    expect(terms).not.toContain('service');
  });

  it('all entries default allowOverride to true', () => {
    for (const entry of STRONG_TERMS) {
      expect(entry.allowOverride ?? true).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd halftrans && npx vitest run tests/core/strong-terms.test.ts`

Expected: FAIL — module `@core/strong-terms` does not exist.

- [ ] **Step 3: Write the implementation**

Create `halftrans/src/core/strong-terms.ts`:

```typescript
export interface StrongTerm {
  term: string;
  allowOverride?: boolean;
}

export const STRONG_TERMS: StrongTerm[] = [
  // Programming paradigms & concepts
  { term: 'event loop' },
  { term: 'callback' },
  { term: 'promise' },
  { term: 'closure' },
  { term: 'runtime' },
  { term: 'fiber' },
  { term: 'coroutine' },
  { term: 'goroutine' },
  { term: 'async/await' },
  { term: 'generator' },
  { term: 'iterator' },
  { term: 'decorator' },
  { term: 'mixin' },
  { term: 'trait' },
  { term: 'monad' },
  { term: 'functor' },

  // Frontend
  { term: 'virtual DOM' },
  { term: 'reconciliation' },
  { term: 'hydration' },
  { term: 'SSR' },
  { term: 'SSG' },
  { term: 'hook' },
  { term: 'render props' },
  { term: 'higher-order component' },
  { term: 'slot' },
  { term: 'directive' },
  { term: 'composable' },

  // AI/ML
  { term: 'transformer' },
  { term: 'embedding' },
  { term: 'token' },
  { term: 'attention' },
  { term: 'fine-tuning' },
  { term: 'inference' },
  { term: 'RAG' },
  { term: 'prompt' },
  { term: 'hallucination' },
  { term: 'agent' },

  // Cloud native & infrastructure
  { term: 'pod' },
  { term: 'deployment' },
  { term: 'ingress' },
  { term: 'service mesh' },
  { term: 'sidecar' },
  { term: 'operator' },
  { term: 'daemon' },
  { term: 'cron job' },

  // Systems & networking
  { term: 'middleware' },
  { term: 'webhook' },
  { term: 'websocket' },
  { term: 'gRPC' },
  { term: 'GraphQL' },
  { term: 'REST' },
  { term: 'mutex' },
  { term: 'semaphore' },
  { term: 'deadlock' },
  { term: 'race condition' },

  // Data & storage
  { term: 'schema' },
  { term: 'migration' },
  { term: 'ORM' },
  { term: 'sharding' },
  { term: 'replica' },

  // DevOps & tools
  { term: 'CI/CD' },
  { term: 'pipeline' },
  { term: 'container' },
  { term: 'orchestration' },
  { term: 'canary' },
  { term: 'blue-green' },

  // General dev concepts
  { term: 'framework' },
  { term: 'library' },
  { term: 'API' },
  { term: 'SDK' },
  { term: 'CLI' },
  { term: 'IDE' },
  { term: 'linter' },
  { term: 'bundler' },
  { term: 'polyfill' },
  { term: 'shim' },
  { term: 'boilerplate' },
  { term: 'scaffold' },
  { term: 'monorepo' },
  { term: 'microservice' },
];

export function getStrongTermsList(): string {
  return STRONG_TERMS.map((t) => t.term).join(', ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd halftrans && npx vitest run tests/core/strong-terms.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/strong-terms.ts halftrans/tests/core/strong-terms.test.ts
git commit -m "feat: add static strong terms dictionary"
```

---

### Task 3: Rewrite Prompt Builder

**Files:**
- Modify: `halftrans/src/core/prompt.ts`
- Modify: `halftrans/tests/core/prompt.test.ts`

- [ ] **Step 1: Write the new tests**

Replace `halftrans/tests/core/prompt.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, buildBatchUserPrompt } from '@core/prompt';
import type { TranslationContext } from '@shared/types';

const emptyContext: TranslationContext = {
  pageContext: '',
  sectionContext: '',
  surroundingText: '',
  codeContext: '',
};

describe('prompt', () => {
  describe('buildSystemPrompt', () => {
    it('contains HARD RULES section', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('=== HARD RULES ===');
      expect(prompt).toContain('永不翻译');
    });

    it('contains STRONG TERMS section with terms from dictionary', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('=== STRONG TERMS ===');
      expect(prompt).toContain('event loop');
      expect(prompt).toContain('callback');
    });

    it('contains GUIDANCE section with style', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).toContain('=== GUIDANCE ===');
      expect(prompt).toContain('口语化');
    });

    it('uses formal style when specified', () => {
      const prompt = buildSystemPrompt('formal', [], []);
      expect(prompt).toContain('书面化');
    });

    it('includes user keep-terms in USER DICTIONARY section', () => {
      const prompt = buildSystemPrompt('colloquial', ['Event Loop', 'Fiber'], []);
      expect(prompt).toContain('=== USER DICTIONARY ===');
      expect(prompt).toContain('Event Loop');
      expect(prompt).toContain('Fiber');
      expect(prompt).toContain('始终保留英文');
    });

    it('includes user translate-terms in USER DICTIONARY section', () => {
      const prompt = buildSystemPrompt('colloquial', [], ['server', 'request']);
      expect(prompt).toContain('始终翻译为中文');
      expect(prompt).toContain('server');
      expect(prompt).toContain('request');
    });

    it('omits USER DICTIONARY section when no user terms', () => {
      const prompt = buildSystemPrompt('colloquial', [], []);
      expect(prompt).not.toContain('=== USER DICTIONARY ===');
    });
  });

  describe('buildUserPrompt', () => {
    it('includes page context section when provided', () => {
      const ctx: TranslationContext = {
        pageContext: 'Understanding React Hooks',
        sectionContext: 'State Management',
        surroundingText: 'React provides several hooks...',
        codeContext: 'const [count, setCount] = useState(0)',
      };
      const prompt = buildUserPrompt('The hook can access state.', ctx);
      expect(prompt).toContain('=== PAGE ===');
      expect(prompt).toContain('Understanding React Hooks');
      expect(prompt).toContain('=== SECTION ===');
      expect(prompt).toContain('State Management');
      expect(prompt).toContain('=== CODE ===');
      expect(prompt).toContain('useState(0)');
      expect(prompt).toContain('=== CONTEXT ===');
      expect(prompt).toContain('React provides several hooks');
      expect(prompt).toContain('=== TRANSLATE ===');
      expect(prompt).toContain('The hook can access state.');
    });

    it('omits empty context sections', () => {
      const prompt = buildUserPrompt('Hello world.', emptyContext);
      expect(prompt).not.toContain('=== PAGE ===');
      expect(prompt).not.toContain('=== SECTION ===');
      expect(prompt).not.toContain('=== CODE ===');
      expect(prompt).not.toContain('=== CONTEXT ===');
      expect(prompt).toContain('=== TRANSLATE ===');
      expect(prompt).toContain('Hello world.');
    });
  });

  describe('buildBatchUserPrompt', () => {
    it('joins texts with [SEP] markers and includes context', () => {
      const ctx: TranslationContext = {
        pageContext: 'Node.js Guide',
        sectionContext: '',
        surroundingText: '',
        codeContext: '',
      };
      const texts = ['Hello world', 'Goodbye world'];
      const prompt = buildBatchUserPrompt(texts, ctx);
      expect(prompt).toContain('[SEP]');
      expect(prompt).toContain('Hello world');
      expect(prompt).toContain('Goodbye world');
      expect(prompt).toContain('=== PAGE ===');
      expect(prompt).toContain('Node.js Guide');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd halftrans && npx vitest run tests/core/prompt.test.ts`

Expected: FAIL — old `buildSystemPrompt` signature doesn't match, new sections not present.

- [ ] **Step 3: Write the new prompt.ts**

Replace `halftrans/src/core/prompt.ts` with:

```typescript
import type { TranslationStyle, TranslationContext } from '@shared/types';
import { getStrongTermsList } from './strong-terms';

export function buildSystemPrompt(
  style: TranslationStyle,
  keepTerms: string[],
  translateTerms: string[]
): string {
  const styleText = style === 'colloquial'
    ? '口语化，自然流畅，像同事之间交流'
    : '书面化，正式专业，适合文档阅读';

  const strongTerms = getStrongTermsList();

  let userDict = '';
  if (keepTerms.length > 0 || translateTerms.length > 0) {
    userDict = '\n\n=== USER DICTIONARY ===';
    if (keepTerms.length > 0) {
      userDict += `\n始终保留英文：${keepTerms.join(', ')}`;
    }
    if (translateTerms.length > 0) {
      userDict += `\n始终翻译为中文：${translateTerms.join(', ')}`;
    }
    userDict += '\n（用户词库优先级高于其他规则）';
  }

  return `你是程序员认知翻译助手。目标不是语言翻译，而是将英文技术内容转换为程序员最容易理解的表达形式。

=== HARD RULES ===
- 代码标识符（变量名、函数名、类名、包名、命令）永不翻译
- 代码块、日志内容、配置文件内容保持原样
- API 字段（userId, createdAt 等）保持原样
- 固定搭配保持整体：HTTP request, Pull Request, Dependency Injection

=== STRONG TERMS ===
以下术语在技术语境中通常保留英文原文：
${strongTerms}
（如果上下文表明某词不是作为技术概念使用，仍可翻译）

=== GUIDANCE ===
- 优先理解语义，禁止逐词翻译
- 普通技术词默认翻译为中文（如 server, request, response 等有明确中文对应的词）
- 同一概念全文保持一致
- 输出长度 ≤ 原文 1.3 倍，禁止扩展解释
- 翻译风格：${styleText}
- 只输出翻译结果${userDict}`;
}

export function buildUserPrompt(text: string, context: TranslationContext): string {
  const sections: string[] = [];

  if (context.pageContext) {
    sections.push(`=== PAGE ===\n${context.pageContext}`);
  }
  if (context.sectionContext) {
    sections.push(`=== SECTION ===\n${context.sectionContext}`);
  }
  if (context.codeContext) {
    sections.push(`=== CODE ===\n${context.codeContext}`);
  }
  if (context.surroundingText) {
    sections.push(`=== CONTEXT ===\n${context.surroundingText}`);
  }

  sections.push(`=== TRANSLATE ===\n${text}`);

  return sections.join('\n\n');
}

export function buildBatchUserPrompt(texts: string[], context: TranslationContext): string {
  const sections: string[] = [];

  if (context.pageContext) {
    sections.push(`=== PAGE ===\n${context.pageContext}`);
  }
  if (context.sectionContext) {
    sections.push(`=== SECTION ===\n${context.sectionContext}`);
  }
  if (context.codeContext) {
    sections.push(`=== CODE ===\n${context.codeContext}`);
  }
  if (context.surroundingText) {
    sections.push(`=== CONTEXT ===\n${context.surroundingText}`);
  }

  const joined = texts.map((t) => `[SEP]\n${t}`).join('\n');
  sections.push(`=== TRANSLATE ===\n${joined}\n[SEP]`);

  return sections.join('\n\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/core/prompt.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/core/prompt.ts halftrans/tests/core/prompt.test.ts
git commit -m "refactor: rewrite prompt with three-layer rules and context blocks"
```

---

### Task 4: Create Context Builder

**Files:**
- Create: `halftrans/src/content/context-builder.ts`
- Create: `halftrans/tests/content/context-builder.test.ts`

- [ ] **Step 1: Write the test**

Create `halftrans/tests/content/context-builder.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { collectPageContext, collectParagraphContext } from '@content/context-builder';

describe('context-builder', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Understanding React Hooks';
  });

  describe('collectPageContext', () => {
    it('returns page title', () => {
      const ctx = collectPageContext();
      expect(ctx).toContain('Understanding React Hooks');
    });

    it('includes H1 and H2 headings', () => {
      document.body.innerHTML = `
        <h1>React Hooks</h1>
        <h2>useState</h2>
        <h2>useEffect</h2>
      `;
      const ctx = collectPageContext();
      expect(ctx).toContain('React Hooks');
      expect(ctx).toContain('useState');
      expect(ctx).toContain('useEffect');
    });

    it('limits headings to 8', () => {
      document.body.innerHTML = Array.from({ length: 12 }, (_, i) =>
        `<h2>Heading ${i}</h2>`
      ).join('');
      const ctx = collectPageContext();
      expect(ctx).toContain('Heading 0');
      expect(ctx).toContain('Heading 7');
      expect(ctx).not.toContain('Heading 8');
    });
  });

  describe('collectParagraphContext', () => {
    it('returns surrounding paragraphs', () => {
      document.body.innerHTML = `
        <p data-halftrans-id="p1">First paragraph about hooks.</p>
        <p data-halftrans-id="p2">Second paragraph about state.</p>
        <p data-halftrans-id="p3">Third paragraph about effects.</p>
        <p data-halftrans-id="p4">Fourth paragraph about context.</p>
        <p data-halftrans-id="p5">Fifth paragraph about refs.</p>
      `;
      const el = document.querySelector('[data-halftrans-id="p3"]')!;
      const ctx = collectParagraphContext(el);
      expect(ctx.surroundingText).toContain('First paragraph');
      expect(ctx.surroundingText).toContain('Second paragraph');
      expect(ctx.surroundingText).toContain('Fourth paragraph');
      expect(ctx.surroundingText).toContain('Fifth paragraph');
    });

    it('returns nearest section heading', () => {
      document.body.innerHTML = `
        <h2>State Management</h2>
        <p data-halftrans-id="p1">The hook can access state.</p>
      `;
      const el = document.querySelector('[data-halftrans-id="p1"]')!;
      const ctx = collectParagraphContext(el);
      expect(ctx.sectionContext).toContain('State Management');
    });

    it('returns nearest code block', () => {
      document.body.innerHTML = `
        <pre><code>const [count, setCount] = useState(0)</code></pre>
        <p data-halftrans-id="p1">The hook can access state.</p>
      `;
      const el = document.querySelector('[data-halftrans-id="p1"]')!;
      const ctx = collectParagraphContext(el);
      expect(ctx.codeContext).toContain('useState(0)');
    });

    it('truncates long code blocks to 300 chars', () => {
      const longCode = 'x'.repeat(500);
      document.body.innerHTML = `
        <pre><code>${longCode}</code></pre>
        <p data-halftrans-id="p1">Text.</p>
      `;
      const el = document.querySelector('[data-halftrans-id="p1"]')!;
      const ctx = collectParagraphContext(el);
      expect(ctx.codeContext.length).toBeLessThanOrEqual(303);
    });

    it('returns empty strings when no context available', () => {
      document.body.innerHTML = `<p data-halftrans-id="p1">Alone.</p>`;
      const el = document.querySelector('[data-halftrans-id="p1"]')!;
      const ctx = collectParagraphContext(el);
      expect(ctx.sectionContext).toBe('');
      expect(ctx.codeContext).toBe('');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd halftrans && npx vitest run tests/content/context-builder.test.ts`

Expected: FAIL — module `@content/context-builder` does not exist.

- [ ] **Step 3: Write the implementation**

Create `halftrans/src/content/context-builder.ts`:

```typescript
import type { TranslationContext } from '@shared/types';

const MAX_HEADINGS = 8;
const MAX_SURROUNDING = 2;
const MAX_CODE_LENGTH = 300;
const MAX_PARAGRAPH_LENGTH = 200;

let cachedPageContext: string | null = null;

export function collectPageContext(): string {
  if (cachedPageContext !== null) return cachedPageContext;

  const parts: string[] = [];

  const title = document.title.trim();
  if (title) parts.push(`Title: ${title}`);

  const headings = document.querySelectorAll('h1, h2, h3');
  const headingTexts: string[] = [];
  for (const el of headings) {
    if (headingTexts.length >= MAX_HEADINGS) break;
    const text = el.textContent?.trim();
    if (text) headingTexts.push(text);
  }
  if (headingTexts.length > 0) {
    parts.push(headingTexts.join(' > '));
  }

  cachedPageContext = parts.join('\n');
  return cachedPageContext;
}

export function resetPageContextCache(): void {
  cachedPageContext = null;
}

export function collectParagraphContext(element: Element): Omit<TranslationContext, 'pageContext'> {
  return {
    sectionContext: findSectionHeading(element),
    surroundingText: findSurroundingText(element),
    codeContext: findNearestCode(element),
  };
}

export function buildFullContext(element: Element): TranslationContext {
  const paragraphCtx = collectParagraphContext(element);
  return {
    pageContext: collectPageContext(),
    ...paragraphCtx,
  };
}

export function buildBatchContext(elements: Element[]): TranslationContext {
  if (elements.length === 0) {
    return { pageContext: collectPageContext(), sectionContext: '', surroundingText: '', codeContext: '' };
  }

  const first = elements[0];
  const last = elements[elements.length - 1];

  const sectionContext = findSectionHeading(first);
  const codeContext = findNearestCodeForBatch(elements);
  const surroundingText = findBatchSurroundingText(first, last);

  return {
    pageContext: collectPageContext(),
    sectionContext,
    surroundingText,
    codeContext,
  };
}

function findSectionHeading(element: Element): string {
  let current: Element | null = element;
  while (current) {
    const prev = current.previousElementSibling;
    if (prev && /^H[1-3]$/i.test(prev.tagName)) {
      return prev.textContent?.trim() ?? '';
    }
    current = prev;
  }

  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const heading = parent.querySelector('h1, h2, h3');
    if (heading) {
      const headingRect = heading.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      if (headingRect.top < elementRect.top) {
        return heading.textContent?.trim() ?? '';
      }
    }
    parent = parent.parentElement;
  }

  return '';
}

function findSurroundingText(element: Element): string {
  const paragraphs = Array.from(document.querySelectorAll('p, li'));
  const idx = paragraphs.indexOf(element);
  if (idx === -1) return '';

  const texts: string[] = [];

  for (let i = Math.max(0, idx - MAX_SURROUNDING); i < idx; i++) {
    const text = paragraphs[i].textContent?.trim();
    if (text) texts.push(`[前文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  for (let i = idx + 1; i <= Math.min(paragraphs.length - 1, idx + MAX_SURROUNDING); i++) {
    const text = paragraphs[i].textContent?.trim();
    if (text) texts.push(`[后文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  return texts.join('\n');
}

function findBatchSurroundingText(first: Element, last: Element): string {
  const paragraphs = Array.from(document.querySelectorAll('p, li'));
  const firstIdx = paragraphs.indexOf(first);
  const lastIdx = paragraphs.indexOf(last);
  if (firstIdx === -1) return '';

  const texts: string[] = [];

  for (let i = Math.max(0, firstIdx - MAX_SURROUNDING); i < firstIdx; i++) {
    const text = paragraphs[i].textContent?.trim();
    if (text) texts.push(`[前文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  const endIdx = lastIdx === -1 ? firstIdx : lastIdx;
  for (let i = endIdx + 1; i <= Math.min(paragraphs.length - 1, endIdx + MAX_SURROUNDING); i++) {
    const text = paragraphs[i].textContent?.trim();
    if (text) texts.push(`[后文] ${text.slice(0, MAX_PARAGRAPH_LENGTH)}`);
  }

  return texts.join('\n');
}

function findNearestCode(element: Element): string {
  let current: Element | null = element;
  for (let i = 0; i < 5 && current; i++) {
    const prev = current.previousElementSibling;
    if (prev) {
      const code = prev.tagName === 'PRE' ? prev : prev.querySelector('pre');
      if (code) {
        const text = code.textContent?.trim() ?? '';
        return text.slice(0, MAX_CODE_LENGTH);
      }
    }
    current = prev;
  }

  current = element;
  for (let i = 0; i < 3 && current; i++) {
    const next = current.nextElementSibling;
    if (next) {
      const code = next.tagName === 'PRE' ? next : next.querySelector('pre');
      if (code) {
        const text = code.textContent?.trim() ?? '';
        return text.slice(0, MAX_CODE_LENGTH);
      }
    }
    current = next;
  }

  return '';
}

function findNearestCodeForBatch(elements: Element[]): string {
  for (const el of elements) {
    const code = findNearestCode(el);
    if (code) return code;
  }
  return '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd halftrans && npx vitest run tests/content/context-builder.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/content/context-builder.ts halftrans/tests/content/context-builder.test.ts
git commit -m "feat: add DOM-based context builder for translation"
```

---

### Task 5: Simplify Direct API Provider

**Files:**
- Modify: `halftrans/src/core/direct-api.ts`
- Modify: `halftrans/src/core/provider.ts`
- Modify: `halftrans/tests/core/direct-api.test.ts`

- [ ] **Step 1: Write the new tests**

Replace `halftrans/tests/core/direct-api.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectAPIProvider } from '@core/direct-api';
import type { TranslationRequest, BatchTranslationRequest, TranslationContext } from '@shared/types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const emptyContext: TranslationContext = {
  pageContext: '',
  sectionContext: '',
  surroundingText: '',
  codeContext: '',
};

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
    context: emptyContext,
    keepTerms: [],
    translateTerms: [],
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
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(provider.translate(baseRequest)).rejects.toThrow('API error: 401');
  });

  it('passes context to user prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'translated' } }],
      }),
    });

    const request: TranslationRequest = {
      ...baseRequest,
      context: {
        pageContext: 'React Hooks Guide',
        sectionContext: 'useState',
        surroundingText: '',
        codeContext: 'const [x, setX] = useState(0)',
      },
    };

    await provider.translate(request);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMsg = body.messages[1].content;
    expect(userMsg).toContain('React Hooks Guide');
    expect(userMsg).toContain('useState(0)');
  });

  it('includes user keep-terms in system prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'translated' } }],
      }),
    });

    const request: TranslationRequest = {
      ...baseRequest,
      keepTerms: ['Event Loop'],
    };

    await provider.translate(request);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Event Loop');
    expect(body.messages[0].content).toContain('始终保留英文');
  });

  describe('translateBatch', () => {
    const batchRequest: BatchTranslationRequest = {
      paragraphs: [
        { id: 'p1', text: 'Our server encounters an issue.' },
        { id: 'p2', text: 'Please retry your request.' },
      ],
      settings: baseRequest.settings,
      context: emptyContext,
      keepTerms: [],
      translateTerms: [],
    };

    it('sends batch and parses [SEP] response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '[SEP]\n我们的服务器遇到了问题。\n[SEP]\n请重试您的请求。\n[SEP]' } }],
        }),
      });

      const result = await provider.translateBatch(batchRequest);
      expect(result.results.length).toBe(2);
      expect(result.results[0].translated).toBe('我们的服务器遇到了问题。');
      expect(result.results[1].translated).toBe('请重试您的请求。');
    });

    it('falls back to individual calls on separator mismatch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'no separators here' } }],
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
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(provider.translateBatch(batchRequest)).rejects.toThrow('API error: 500');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd halftrans && npx vitest run tests/core/direct-api.test.ts`

Expected: FAIL — old interface doesn't match.

- [ ] **Step 3: Update provider interface**

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
    const { text, paragraphId, settings, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(settings.style, keepTerms, translateTerms);
    const userPrompt = buildUserPrompt(text, context);

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
    const { paragraphs, settings, context, keepTerms, translateTerms } = request;

    const systemPrompt = buildSystemPrompt(settings.style, keepTerms, translateTerms);
    const userPrompt = buildBatchUserPrompt(paragraphs.map((p) => p.text), context);

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
        context,
        keepTerms,
        translateTerms,
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
git add halftrans/src/core/provider.ts halftrans/src/core/direct-api.ts halftrans/tests/core/direct-api.test.ts
git commit -m "refactor: simplify direct-api to accept context instead of terms"
```

---

### Task 6: Rewire Background Service Worker

**Files:**
- Modify: `halftrans/src/background/index.ts`

- [ ] **Step 1: Rewrite background/index.ts**

Replace `halftrans/src/background/index.ts` with:

```typescript
import { DirectAPIProvider } from '@core/direct-api';
import { getSettings, getTerminology } from '@shared/storage';
import type { MessageType, TranslationContext } from '@shared/types';

const provider = new DirectAPIProvider();

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

chrome.runtime.onMessage.addListener((message: MessageType, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (message.type === 'TRANSLATE_PARAGRAPHS') {
    translateBatch(tabId, message.payload.paragraphs, message.payload.context);
  } else if (message.type === 'TRANSLATE_SELECTION') {
    translateSingle(tabId, message.payload.text, message.payload.id, message.payload.context);
  }
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

    const { keepTerms, translateTerms } = await getUserTerms();
    const batches = chunk(paragraphs, BATCH_SIZE);

    for (const batch of batches) {
      const result = await provider.translateBatch({
        paragraphs: batch,
        settings,
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
    const settings = await getSettings();

    if (!settings.apiKey) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TRANSLATION_ERROR',
        payload: { paragraphId, error: '请先在设置中配置 API Key' },
      } as MessageType);
      return;
    }

    const { keepTerms, translateTerms } = await getUserTerms();

    const result = await provider.translate({
      text,
      paragraphId,
      settings,
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

- [ ] **Step 2: Verify TypeScript compiles for background**

Run: `cd halftrans && npx tsc --noEmit src/background/index.ts 2>&1 | head -20`

Expected: Clean or only errors from content-script files (fixed in next task).

- [ ] **Step 3: Commit**

```bash
git add halftrans/src/background/index.ts
git commit -m "refactor: simplify background to single-call context-first flow"
```

---

### Task 7: Rewire Content Script

**Files:**
- Modify: `halftrans/src/content/translator.ts`
- Modify: `halftrans/src/content/index.ts`
- Modify: `halftrans/tests/content/translator.test.ts`

- [ ] **Step 1: Rewrite translator.ts**

Replace `halftrans/src/content/translator.ts` with:

```typescript
import { sendToBackground } from '@shared/messaging';
import { renderLoading, renderTranslation, renderError, markSkipped } from './renderer';
import { buildBatchContext, collectPageContext } from './context-builder';
import type { TranslationContext } from '@shared/types';

export class TranslationOrchestrator {
  private pending = new Map<string, string>();
  private selectionCounter = 0;

  translateParagraphs(paragraphs: Array<{ id: string; text: string; element: Element }>): void {
    const newParagraphs = paragraphs.filter((p) => !this.pending.has(p.id));
    if (newParagraphs.length === 0) return;

    for (const p of newParagraphs) {
      this.pending.set(p.id, p.text);
      renderLoading(p.id);
    }

    const context = buildBatchContext(newParagraphs.map((p) => p.element));

    sendToBackground({
      type: 'TRANSLATE_PARAGRAPHS',
      payload: {
        paragraphs: newParagraphs.map(({ id, text }) => ({ id, text })),
        context,
      },
    });
  }

  translateSelection(text: string): void {
    const id = `sel-${this.selectionCounter++}`;
    const context: TranslationContext = {
      pageContext: collectPageContext(),
      sectionContext: '',
      surroundingText: '',
      codeContext: '',
    };

    sendToBackground({
      type: 'TRANSLATE_SELECTION',
      payload: { text, id, context },
    });
  }

  handleResult(paragraphId: string, translated: string): void {
    const original = this.pending.get(paragraphId) ?? '';
    this.pending.delete(paragraphId);
    if (!translated || translated.trim() === original.trim()) {
      markSkipped(paragraphId);
      return;
    }
    renderTranslation(paragraphId, translated);
  }

  handleError(paragraphId: string, error: string): void {
    this.pending.delete(paragraphId);
    renderError(paragraphId, error);
  }
}
```

- [ ] **Step 2: Rewrite content/index.ts**

Replace `halftrans/src/content/index.ts` with:

```typescript
import { onMessage } from '@shared/messaging';
import { detectVisibleParagraphs, observeNewParagraphs } from './detector';
import { resetPageContextCache } from './context-builder';
import { initFloatingButton } from './floating-btn';
import { toggleAllTranslations } from './renderer';
import { TranslationOrchestrator } from './translator';
import type { MessageType } from '@shared/types';
import './styles/content.css';

const orchestrator = new TranslationOrchestrator();
let pageTranslateActive = false;
let translationsVisible = false;

function translateVisibleParagraphs(): void {
  const paragraphs = detectVisibleParagraphs();
  if (paragraphs.length > 0) {
    orchestrator.translateParagraphs(paragraphs);
  }
}

function handlePageTranslate(): void {
  if (pageTranslateActive) {
    translationsVisible = !translationsVisible;
    toggleAllTranslations();
    return;
  }

  pageTranslateActive = true;
  translationsVisible = true;
  resetPageContextCache();

  translateVisibleParagraphs();

  let scrollTimeout: ReturnType<typeof setTimeout>;
  window.addEventListener('scroll', () => {
    if (!translationsVisible) return;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(translateVisibleParagraphs, 200);
  });
}

initFloatingButton((text) => {
  orchestrator.translateSelection(text);
});

let mutationTimeout: ReturnType<typeof setTimeout>;
observeNewParagraphs(() => {
  if (pageTranslateActive && translationsVisible) {
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(translateVisibleParagraphs, 150);
  }
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

- [ ] **Step 3: Update translator test**

Replace `halftrans/tests/content/translator.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationOrchestrator } from '@content/translator';

vi.mock('@shared/messaging', () => ({
  sendToBackground: vi.fn(),
}));

vi.mock('@content/renderer', () => ({
  renderLoading: vi.fn(),
  renderTranslation: vi.fn(),
  renderError: vi.fn(),
  markSkipped: vi.fn(),
}));

vi.mock('@content/context-builder', () => ({
  buildBatchContext: vi.fn(() => ({
    pageContext: 'Test Page',
    sectionContext: '',
    surroundingText: '',
    codeContext: '',
  })),
  collectPageContext: vi.fn(() => 'Test Page'),
}));

import { sendToBackground } from '@shared/messaging';
import { renderLoading, renderTranslation, renderError, markSkipped } from '@content/renderer';

describe('TranslationOrchestrator', () => {
  let orchestrator: TranslationOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new TranslationOrchestrator();
  });

  describe('translateParagraphs', () => {
    it('sends paragraphs with context to background', () => {
      const el = document.createElement('p');
      orchestrator.translateParagraphs([{ id: 'p1', text: 'Hello', element: el }]);

      expect(renderLoading).toHaveBeenCalledWith('p1');
      expect(sendToBackground).toHaveBeenCalledWith({
        type: 'TRANSLATE_PARAGRAPHS',
        payload: {
          paragraphs: [{ id: 'p1', text: 'Hello' }],
          context: expect.objectContaining({ pageContext: 'Test Page' }),
        },
      });
    });

    it('skips already-pending paragraphs', () => {
      const el = document.createElement('p');
      orchestrator.translateParagraphs([{ id: 'p1', text: 'Hello', element: el }]);
      orchestrator.translateParagraphs([{ id: 'p1', text: 'Hello', element: el }]);

      expect(sendToBackground).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleResult', () => {
    it('renders translation on success', () => {
      const el = document.createElement('p');
      orchestrator.translateParagraphs([{ id: 'p1', text: 'Hello', element: el }]);
      orchestrator.handleResult('p1', '你好');

      expect(renderTranslation).toHaveBeenCalledWith('p1', '你好');
    });

    it('marks skipped when translation matches original', () => {
      const el = document.createElement('p');
      orchestrator.translateParagraphs([{ id: 'p1', text: 'Hello', element: el }]);
      orchestrator.handleResult('p1', 'Hello');

      expect(markSkipped).toHaveBeenCalledWith('p1');
    });
  });

  describe('handleError', () => {
    it('renders error message', () => {
      const el = document.createElement('p');
      orchestrator.translateParagraphs([{ id: 'p1', text: 'Hello', element: el }]);
      orchestrator.handleError('p1', 'API error');

      expect(renderError).toHaveBeenCalledWith('p1', 'API error');
    });
  });
});
```

- [ ] **Step 4: Run all modified tests**

Run: `cd halftrans && npx vitest run tests/content/translator.test.ts tests/core/prompt.test.ts tests/core/direct-api.test.ts tests/core/strong-terms.test.ts tests/content/context-builder.test.ts`

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add halftrans/src/content/translator.ts halftrans/src/content/index.ts halftrans/tests/content/translator.test.ts
git commit -m "refactor: rewire content script to use context-builder"
```

---

### Task 8: Delete Dead Code

**Files:**
- Delete: `halftrans/src/core/term-extractor.ts`
- Delete: `halftrans/src/core/terminology.ts`
- Delete: `halftrans/src/core/context-serializer.ts`
- Delete: `halftrans/src/core/term-cache.ts`
- Delete: `halftrans/src/content/context-extractor.ts`
- Delete: `halftrans/tests/core/term-extractor.test.ts`
- Delete: `halftrans/tests/core/terminology.test.ts`
- Delete: `halftrans/tests/core/term-cache.test.ts`
- Delete: `halftrans/tests/content/context-extractor.test.ts`

- [ ] **Step 1: Delete the files**

```bash
cd halftrans
rm src/core/term-extractor.ts
rm src/core/terminology.ts
rm src/core/context-serializer.ts
rm src/core/term-cache.ts
rm src/content/context-extractor.ts
rm tests/core/term-extractor.test.ts
rm tests/core/terminology.test.ts
rm tests/core/term-cache.test.ts
rm tests/content/context-extractor.test.ts
```

- [ ] **Step 2: Run full test suite**

Run: `cd halftrans && npx vitest run`

Expected: All remaining tests PASS. No imports reference deleted modules.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd halftrans && npx tsc --noEmit`

Expected: Clean — no errors.

- [ ] **Step 4: Commit**

```bash
cd halftrans
git add -A
git commit -m "refactor: delete term-extractor, terminology, context-serializer, term-cache"
```

---

### Task 9: Final Verification & Build

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd halftrans && npx vitest run`

Expected: All tests pass.

- [ ] **Step 2: TypeScript check**

Run: `cd halftrans && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Build**

Run: `cd halftrans && npm run build`

Expected: Build succeeds, produces dist/ output.

- [ ] **Step 4: Verify no references to deleted modules**

Run: `grep -r "term-extractor\|terminology\|context-serializer\|term-cache\|context-extractor\|TermRecord\|ExtractedTerms\|mergeTermRecords\|buildTermContext\|globalTermRecords" halftrans/src/`

Expected: No matches.

- [ ] **Step 5: Final commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "chore: final cleanup after context-first refactor"
```
