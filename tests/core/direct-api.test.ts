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
