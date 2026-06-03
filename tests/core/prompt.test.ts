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
