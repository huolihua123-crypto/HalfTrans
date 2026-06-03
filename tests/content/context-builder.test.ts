import { describe, it, expect, beforeEach } from 'vitest';
import { collectPageContext, collectParagraphContext, resetPageContextCache } from '@content/context-builder';

describe('context-builder', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Understanding React Hooks';
    resetPageContextCache();
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
