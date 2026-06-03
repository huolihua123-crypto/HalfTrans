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
