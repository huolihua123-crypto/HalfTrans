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
