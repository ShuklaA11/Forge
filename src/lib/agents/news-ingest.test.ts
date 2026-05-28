import { describe, it, expect } from 'vitest';
import { buildIngestQueries, _dedupeAgainstExisting } from './news-ingest';
import type { SearchResult } from './web-search';

describe('buildIngestQueries', () => {
  it('returns empty when no idea and no competitors', () => {
    expect(buildIngestQueries(null, [])).toEqual([]);
    expect(buildIngestQueries('   ', [])).toEqual([]);
  });

  it('produces an idea-based query when idea is set', () => {
    const queries = buildIngestQueries('B2B sales platform for SMBs', []);
    expect(queries).toContain('B2B sales platform for SMBs news');
  });

  it('truncates idea to 12 tokens', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    const [first] = buildIngestQueries(long, []);
    expect(first).toBe('one two three four five six seven eight nine ten eleven twelve news');
  });

  it('adds competitor queries', () => {
    const queries = buildIngestQueries('idea', ['Acme', 'Globex']);
    expect(queries).toEqual(['idea news', 'Acme news', 'Globex news']);
  });

  it('caps competitor queries to 4', () => {
    const queries = buildIngestQueries(null, ['A', 'B', 'C', 'D', 'E', 'F']);
    expect(queries).toEqual(['A news', 'B news', 'C news', 'D news']);
  });
});

describe('_dedupeAgainstExisting', () => {
  function r(url: string): SearchResult {
    return { title: url, url, snippet: '' };
  }

  it('keeps all when no overlap', () => {
    const { fresh, skipped } = _dedupeAgainstExisting(
      [r('https://a.test'), r('https://b.test')],
      new Set(),
    );
    expect(fresh).toHaveLength(2);
    expect(skipped).toBe(0);
  });

  it('skips existing URLs', () => {
    const { fresh, skipped } = _dedupeAgainstExisting(
      [r('https://a.test'), r('https://b.test')],
      new Set(['https://a.test']),
    );
    expect(fresh.map((f) => f.url)).toEqual(['https://b.test']);
    expect(skipped).toBe(1);
  });

  it('dedupes within the input batch', () => {
    const { fresh, skipped } = _dedupeAgainstExisting(
      [r('https://a.test'), r('https://a.test'), r('https://b.test')],
      new Set(),
    );
    expect(fresh.map((f) => f.url)).toEqual(['https://a.test', 'https://b.test']);
    expect(skipped).toBe(1);
  });
});
