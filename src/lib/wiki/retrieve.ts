import type { WikiDocument } from '@prisma/client';
import { listAllLatest } from './store';

export interface RetrievedDoc {
  doc: WikiDocument;
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
const PATH_WEIGHT = 2;
const CONTENT_WEIGHT = 1;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function docTitle(doc: WikiDocument): string {
  const fm = doc.frontmatter as { title?: unknown } | null;
  return fm && typeof fm.title === 'string' ? fm.title : doc.path;
}

function scoreDoc(doc: WikiDocument, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const title = docTitle(doc).toLowerCase();
  const path = doc.path.toLowerCase();
  const content = doc.content.toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    score += countOccurrences(title, token) * TITLE_WEIGHT;
    score += countOccurrences(path, token) * PATH_WEIGHT;
    score += countOccurrences(content, token) * CONTENT_WEIGHT;
  }
  return score;
}

export async function retrieveRelevantDocs(
  projectId: string,
  query: string,
  limit: number = 8,
): Promise<RetrievedDoc[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const docs = await listAllLatest(projectId);
  const scored: RetrievedDoc[] = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

export function formatDocsForPrompt(
  retrieved: RetrievedDoc[],
  maxCharsPerDoc: number = 2000,
): string {
  if (retrieved.length === 0) return '_No relevant wiki pages found._';

  return retrieved
    .map((r) => {
      const title = docTitle(r.doc);
      const truncated =
        r.doc.content.length > maxCharsPerDoc
          ? r.doc.content.slice(0, maxCharsPerDoc) + '…'
          : r.doc.content;
      return `### ${title}\n\`${r.doc.path}\` (score: ${r.score})\n\n${truncated}`;
    })
    .join('\n\n---\n\n');
}
