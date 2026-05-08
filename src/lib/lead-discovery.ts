import { z } from 'zod';
import { prisma } from './db';
import { runAgent, type LLMCaller } from './agents/runtime';
import {
  searchWeb,
  type SearchResult,
  type WebSearchProvider,
} from './agents/web-search';

export interface Candidate {
  company: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  linkedinUrl?: string;
  sourceUrls: string[];
  rationale: string;
}

const candidateSchema = z.object({
  company: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().optional(),
  sourceUrls: z.array(z.string()).default([]),
  rationale: z.string().min(1),
});

const candidatesEnvelopeSchema = z.object({
  candidates: z.array(candidateSchema),
});

const queriesEnvelopeSchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(8),
});

interface ProjectContext {
  name: string;
  description: string | null;
  idea: string | null;
  approach: string | null;
}

interface SessionContext {
  query: string;
  aiSuggestions: unknown;
}

export async function generateSearchQueries(
  session: SessionContext,
  project: ProjectContext,
  llm?: LLMCaller,
): Promise<string[]> {
  const strategy =
    typeof session.aiSuggestions === 'object' &&
    session.aiSuggestions !== null &&
    'response' in session.aiSuggestions
      ? String((session.aiSuggestions as { response: unknown }).response ?? '')
      : '';

  const systemPrompt = `You generate concrete web search queries that surface real B2B lead candidates (companies and people) matching an ICP. Return 3-5 queries. Each query must be specific enough to find named companies or people, not generic articles. Prefer queries that target directories, "site:linkedin.com/in" searches, "about us" pages, or industry lists. Return JSON only: {"queries": ["...", "..."]}.`;

  const userPrompt = `Project: ${project.name}
Description: ${project.description ?? 'n/a'}
Idea: ${project.idea ?? 'n/a'}
Approach: ${project.approach ?? 'n/a'}

User query: ${session.query}

Strategy from earlier ICP analysis:
${strategy || '(none)'}`;

  const out = await runAgent({
    name: 'lead-discovery.queries',
    systemPrompt,
    userPrompt,
    schema: queriesEnvelopeSchema,
    maxTokens: 512,
    llm,
  });
  return out.queries.slice(0, 5);
}

export async function extractCandidates(
  searchResults: SearchResult[],
  session: SessionContext,
  project: ProjectContext,
  llm?: LLMCaller,
): Promise<Candidate[]> {
  if (searchResults.length === 0) return [];

  const trimmedResults = searchResults.slice(0, 30).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet,
  }));

  const systemPrompt = `You extract concrete lead candidates (companies, optionally with named people) from web search results. For each candidate, you MUST cite at least one URL from the provided search results in sourceUrls — do not invent URLs. If a result doesn't yield a clear lead, skip it. Return JSON only: {"candidates":[{"company":"...","firstName":"...","lastName":"...","title":"...","linkedinUrl":"...","sourceUrls":["..."],"rationale":"..."}]}.`;

  const userPrompt = `Project: ${project.name}
ICP query: ${session.query}

Search results (cite these URLs only):
${JSON.stringify(trimmedResults, null, 2)}`;

  const out = await runAgent({
    name: 'lead-discovery.extract',
    systemPrompt,
    userPrompt,
    schema: candidatesEnvelopeSchema,
    maxTokens: 2048,
    llm,
  });

  const validUrls = new Set(trimmedResults.map((r) => r.url));
  return filterCandidates(out.candidates, validUrls);
}

export function parseCandidates(
  raw: unknown,
  validUrls?: Set<string>,
): Candidate[] {
  const result = candidatesEnvelopeSchema.safeParse(raw);
  if (!result.success) return [];
  return filterCandidates(result.data.candidates, validUrls);
}

function filterCandidates(
  candidates: Candidate[],
  validUrls?: Set<string>,
): Candidate[] {
  return candidates
    .map((c) => {
      const urls = validUrls
        ? c.sourceUrls.filter((u) => validUrls.has(u))
        : c.sourceUrls.filter((u) => typeof u === 'string' && u.length > 0);
      return { ...c, sourceUrls: urls };
    })
    .filter((c) => c.sourceUrls.length > 0);
}

export interface DiscoverDeps {
  llm?: LLMCaller;
  searchProvider?: WebSearchProvider;
}

export async function discoverLeads(
  sessionId: string,
  deps: DiscoverDeps = {},
): Promise<Candidate[]> {
  const session = await prisma.researchSession.findUnique({
    where: { id: sessionId },
    include: { project: true },
  });
  if (!session) throw new Error(`ResearchSession ${sessionId} not found`);

  const projectCtx: ProjectContext = {
    name: session.project.name,
    description: session.project.description,
    idea: session.project.idea,
    approach: session.project.approach,
  };
  const sessionCtx: SessionContext = {
    query: session.query,
    aiSuggestions: session.aiSuggestions,
  };

  const queries = await generateSearchQueries(sessionCtx, projectCtx, deps.llm);
  const results = await searchWeb(queries, {
    provider: deps.searchProvider,
    maxResultsPerQuery: 5,
  });
  const candidates = await extractCandidates(results, sessionCtx, projectCtx, deps.llm);

  const findings = {
    candidates,
    queries,
    searchResultCount: results.length,
    ranAt: new Date().toISOString(),
  };
  await prisma.researchSession.update({
    where: { id: sessionId },
    data: { findings: findings as unknown as object },
  });

  return candidates;
}
