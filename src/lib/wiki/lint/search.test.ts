import { describe, it, expect } from 'vitest';
import {
  StubSearchProvider,
  getSearchProvider,
  parseDuckDuckGoHtml,
  unwrapDuckDuckGoUrl,
  DuckDuckGoProvider,
} from './search';

describe('unwrapDuckDuckGoUrl', () => {
  it('decodes the uddg wrapper used by DDG result links', () => {
    const wrapped =
      '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath%3Fq%3D1&rut=abc';
    expect(unwrapDuckDuckGoUrl(wrapped)).toBe('https://example.com/path?q=1');
  });

  it('promotes protocol-relative URLs to https', () => {
    expect(unwrapDuckDuckGoUrl('//example.com/x')).toBe('https://example.com/x');
  });

  it('passes plain absolute URLs through unchanged', () => {
    expect(unwrapDuckDuckGoUrl('https://example.com/x')).toBe(
      'https://example.com/x',
    );
  });

  it('returns the original href when the wrapper is malformed', () => {
    const bad = '//duckduckgo.com/l/?uddg=%E0%A4%A';
    expect(unwrapDuckDuckGoUrl(bad)).toBe(bad);
  });
});

describe('parseDuckDuckGoHtml', () => {
  it('extracts title, url, and snippet from a real-shaped result', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Facme.com%2Fabout">Acme &amp; Co</a>
        <a class="result__snippet" href="#">Acme is a &quot;widget&quot; maker.</a>
      </div>
    `;

    const results = parseDuckDuckGoHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: 'Acme & Co',
      url: 'https://acme.com/about',
      snippet: 'Acme is a "widget" maker.',
    });
  });

  it('drops sponsored/tracker results that stay on duckduckgo.com', () => {
    const html = `
      <a class="result__a" href="//duckduckgo.com/y.js?ad_provider=foo">Sponsored</a>
      <a class="result__snippet" href="#">ad copy</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freal.example%2F">Real Result</a>
      <a class="result__snippet" href="#">real snippet</a>
    `;

    const results = parseDuckDuckGoHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://real.example/');
  });

  it('returns an empty array when nothing matches', () => {
    expect(parseDuckDuckGoHtml('<html><body>no results</body></html>')).toEqual(
      [],
    );
  });
});

describe('StubSearchProvider', () => {
  it('records each call with its query and maxResults', async () => {
    const stub = new StubSearchProvider([
      { title: 't1', url: 'https://a', snippet: 's1' },
    ]);

    await stub.search('hello', { maxResults: 3 });
    await stub.search('world');

    expect(stub.calls).toEqual([
      { query: 'hello', maxResults: 3 },
      { query: 'world', maxResults: undefined },
    ]);
  });

  it('respects maxResults when slicing canned results', async () => {
    const stub = new StubSearchProvider([
      { title: 't1', url: 'https://a', snippet: '' },
      { title: 't2', url: 'https://b', snippet: '' },
      { title: 't3', url: 'https://c', snippet: '' },
    ]);

    const results = await stub.search('q', { maxResults: 2 });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.title)).toEqual(['t1', 't2']);
  });
});

describe('getSearchProvider', () => {
  it('returns DuckDuckGoProvider by default', () => {
    const provider = getSearchProvider({});
    expect(provider).toBeInstanceOf(DuckDuckGoProvider);
    expect(provider.name).toBe('duckduckgo');
  });

  it('honors an explicit duckduckgo selection', () => {
    const provider = getSearchProvider({ WIKI_SEARCH_PROVIDER: 'DuckDuckGo' });
    expect(provider).toBeInstanceOf(DuckDuckGoProvider);
  });

  it('throws on an unknown provider name', () => {
    expect(() => getSearchProvider({ WIKI_SEARCH_PROVIDER: 'bing' })).toThrow(
      /Unknown WIKI_SEARCH_PROVIDER/,
    );
  });
});
