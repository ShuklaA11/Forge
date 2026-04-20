export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchProvider {
  readonly name: string;
  search(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]>;
}

export class WebSearchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'WebSearchError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const HARD_MAX_RESULTS = 10;
const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';
const DDG_TIMEOUT_MS = 10_000;

export class DuckDuckGoProvider implements WebSearchProvider {
  readonly name = 'duckduckgo';

  async search(
    query: string,
    opts: { maxResults?: number } = {},
  ): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const maxResults = Math.min(opts.maxResults ?? 5, HARD_MAX_RESULTS);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DDG_TIMEOUT_MS);

    let html: string;
    try {
      const res = await fetch(`${DDG_ENDPOINT}?q=${encodeURIComponent(trimmed)}`, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new WebSearchError(`DuckDuckGo returned HTTP ${res.status}`);
      }
      html = await res.text();
    } catch (e: unknown) {
      if (e instanceof WebSearchError) throw e;
      throw new WebSearchError('DuckDuckGo search failed', { cause: e });
    } finally {
      clearTimeout(timer);
    }

    return parseDuckDuckGoHtml(html).slice(0, maxResults);
  }
}

const TITLE_RE = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const SNIPPET_RE = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const titles = Array.from(html.matchAll(TITLE_RE));
  const snippets = Array.from(html.matchAll(SNIPPET_RE));

  const out: SearchResult[] = [];
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    const rawHref = t[1];
    const title = stripTags(t[2]);
    if (!title) continue;
    const url = unwrapDuckDuckGoUrl(rawHref);
    if (!url.startsWith('http')) continue;
    // Ads and sponsored results stay on duckduckgo.com (y.js trackers). Drop them.
    if (/^https?:\/\/(?:[^/]+\.)?duckduckgo\.com\//.test(url)) continue;
    const snippet = snippets[i] ? stripTags(snippets[i][1]) : '';
    out.push({ title, url, snippet });
  }
  return out;
}

export function unwrapDuckDuckGoUrl(href: string): string {
  if (!href) return href;
  // DDG wraps results in //duckduckgo.com/l/?uddg=<encoded>&...
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return href;
    }
  }
  if (href.startsWith('//')) return `https:${href}`;
  return href;
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export class StubSearchProvider implements WebSearchProvider {
  readonly name = 'stub';
  readonly calls: Array<{ query: string; maxResults?: number }> = [];

  constructor(private readonly results: SearchResult[] = []) {}

  async search(
    query: string,
    opts: { maxResults?: number } = {},
  ): Promise<SearchResult[]> {
    this.calls.push({ query, maxResults: opts.maxResults });
    const max = Math.min(opts.maxResults ?? this.results.length, HARD_MAX_RESULTS);
    return this.results.slice(0, max);
  }
}

export function getSearchProvider(
  env: Record<string, string | undefined> = process.env,
): WebSearchProvider {
  const kind = (env.WIKI_SEARCH_PROVIDER ?? 'duckduckgo').toLowerCase();
  switch (kind) {
    case 'duckduckgo':
      return new DuckDuckGoProvider();
    default:
      throw new Error(
        `Unknown WIKI_SEARCH_PROVIDER: ${kind}. Supported: duckduckgo`,
      );
  }
}
