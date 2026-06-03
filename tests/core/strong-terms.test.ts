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
