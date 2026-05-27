import type { Resource } from '@prisma/client';
import { prisma } from '@/lib/db';

export interface RetrievedResource {
  resource: Resource;
  score: number;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'of', 'to', 'and', 'or', 'but', 'in', 'on', 'at', 'by', 'for', 'with',
  'about', 'as', 'from', 'this', 'that', 'these', 'those', 'it', 'its',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'do', 'does', 'did', 'have', 'has', 'had',
]);

const TITLE_WEIGHT = 3;
const USER_NOTE_WEIGHT = 4;
const TAG_WEIGHT = 3;
const DESCRIPTION_WEIGHT = 2;
const EXCERPT_WEIGHT = 1;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export function scoreResource(resource: Resource, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const title = (resource.title || '').toLowerCase();
  const description = (resource.description || '').toLowerCase();
  const userNote = (resource.userNote || '').toLowerCase();
  const excerpt = (resource.fetchedExcerpt || '').toLowerCase();
  const tagsJoined = resource.tags.join(' ').toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    score += countOccurrences(title, token) * TITLE_WEIGHT;
    score += countOccurrences(userNote, token) * USER_NOTE_WEIGHT;
    score += countOccurrences(tagsJoined, token) * TAG_WEIGHT;
    score += countOccurrences(description, token) * DESCRIPTION_WEIGHT;
    score += countOccurrences(excerpt, token) * EXCERPT_WEIGHT;
  }
  return score;
}

export async function retrieveRelevantResources(
  projectId: string,
  query: string,
  limit: number = 5,
): Promise<RetrievedResource[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const resources = await prisma.resource.findMany({ where: { projectId } });
  return resources
    .map((resource) => ({ resource, score: scoreResource(resource, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function formatResourcesForPrompt(
  retrieved: RetrievedResource[],
  maxCharsPerResource: number = 800,
): string {
  if (retrieved.length === 0) return '_No relevant resources saved._';

  return retrieved
    .map((r) => {
      const { resource: res, score } = r;
      const title = res.title || res.url;
      const lines: string[] = [`### [Resource] ${title}`, `<${res.url}> (score: ${score})`];
      if (res.userNote) lines.push(`**Saved note:** ${res.userNote}`);
      if (res.tags.length > 0) lines.push(`Tags: ${res.tags.join(', ')}`);
      if (res.description) lines.push(res.description);
      if (res.fetchedExcerpt) {
        const truncated =
          res.fetchedExcerpt.length > maxCharsPerResource
            ? res.fetchedExcerpt.slice(0, maxCharsPerResource) + '…'
            : res.fetchedExcerpt;
        lines.push(truncated);
      }
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}
