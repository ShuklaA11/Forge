import { prisma } from '../db';
import { searchWeb, type SearchResult, type WebSearchProvider } from './web-search';

export interface NewsIngestResult {
  created: number;
  skipped: number;
  queries: string[];
}

const DEFAULT_MAX_RESULTS_PER_QUERY = 4;
const DEDUPE_WINDOW_DAYS = 30;
const MAX_COMPETITOR_QUERIES = 4;

function competitorNameFromFrontmatter(fm: unknown): string | null {
  if (typeof fm !== 'object' || fm === null) return null;
  const obj = fm as { title?: unknown };
  if (typeof obj.title !== 'string') return null;
  const trimmed = obj.title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildIngestQueries(
  projectIdea: string | null,
  competitorNames: string[],
): string[] {
  const queries: string[] = [];
  if (projectIdea && projectIdea.trim().length > 0) {
    const ideaTokens = projectIdea.split(/\s+/).slice(0, 12).join(' ');
    queries.push(`${ideaTokens} news`);
  }
  for (const name of competitorNames.slice(0, MAX_COMPETITOR_QUERIES)) {
    queries.push(`${name} news`);
  }
  return queries;
}

export interface NewsIngestDeps {
  provider?: WebSearchProvider;
  now?: Date;
}

export async function runNewsIngest(
  projectId: string,
  deps: NewsIngestDeps = {},
): Promise<NewsIngestResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, idea: true },
  });
  if (!project) throw new Error(`Project ${projectId} not found`);

  const companyDocs = await prisma.wikiDocument.findMany({
    where: { projectId, kind: 'COMPANY', supersededById: null },
    select: { frontmatter: true },
  });
  const competitorNames = companyDocs
    .map((d) => competitorNameFromFrontmatter(d.frontmatter))
    .filter((n): n is string => n !== null);

  const queries = buildIngestQueries(project.idea, competitorNames);
  if (queries.length === 0) {
    return { created: 0, skipped: 0, queries: [] };
  }

  const results = await searchWeb(queries, {
    maxResultsPerQuery: DEFAULT_MAX_RESULTS_PER_QUERY,
    provider: deps.provider,
  });

  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const existingUrls = new Set(
    (
      await prisma.wikiRawSource.findMany({
        where: { projectId, kind: 'ARTICLE', createdAt: { gte: cutoff }, url: { not: null } },
        select: { url: true },
      })
    )
      .map((r) => r.url)
      .filter((u): u is string => u !== null),
  );

  let created = 0;
  let skipped = 0;
  for (const result of results) {
    if (existingUrls.has(result.url)) {
      skipped++;
      continue;
    }
    await prisma.wikiRawSource.create({
      data: {
        projectId,
        kind: 'ARTICLE',
        title: result.title.slice(0, 500),
        url: result.url,
        content: result.snippet ?? '',
      },
    });
    existingUrls.add(result.url);
    created++;
  }

  return { created, skipped, queries };
}

// Exposed for tests
export function _dedupeAgainstExisting(
  results: SearchResult[],
  existingUrls: Set<string>,
): { fresh: SearchResult[]; skipped: number } {
  const fresh: SearchResult[] = [];
  let skipped = 0;
  for (const r of results) {
    if (existingUrls.has(r.url)) {
      skipped++;
      continue;
    }
    fresh.push(r);
    existingUrls.add(r.url);
  }
  return { fresh, skipped };
}
