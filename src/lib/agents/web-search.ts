import {
  getSearchProvider,
  StubSearchProvider,
  type SearchResult,
  type WebSearchProvider,
} from '../wiki/lint/search';

export { getSearchProvider, StubSearchProvider };
export type { SearchResult, WebSearchProvider };

export interface SearchWebOptions {
  maxResultsPerQuery?: number;
  provider?: WebSearchProvider;
}

export async function searchWeb(
  queries: string[],
  opts: SearchWebOptions = {},
): Promise<SearchResult[]> {
  const provider = opts.provider ?? getSearchProvider();
  const maxResults = opts.maxResultsPerQuery ?? 5;

  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const q of queries) {
    const trimmed = q.trim();
    if (!trimmed) continue;
    const results = await provider.search(trimmed, { maxResults });
    for (const r of results) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      merged.push(r);
    }
  }

  return merged;
}
