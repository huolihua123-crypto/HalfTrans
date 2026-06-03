import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectVisibleParagraphs, observeNewParagraphs } from '@content/detector';

describe('detector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    });
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
