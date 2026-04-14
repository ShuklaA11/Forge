export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'untitled';
}

export const PROJECT_INDEX_PATH = '_index.md';

export function projectIndexPath(): string {
  return PROJECT_INDEX_PATH;
}

export function companyDir(companyName: string): string {
  return `companies/${slugify(companyName)}`;
}

export function companyIndexPath(companyName: string): string {
  return `${companyDir(companyName)}/index.md`;
}

export function personPath(companyName: string, leadId: string, displayName: string): string {
  return `${companyDir(companyName)}/people/${slugify(displayName)}-${leadId.slice(-8)}.md`;
}

export function callPath(companyName: string, callId: string, callDate: Date, title: string): string {
  const datePart = callDate.toISOString().slice(0, 10);
  return `${companyDir(companyName)}/calls/${datePart}-${slugify(title)}-${callId.slice(-8)}.md`;
}

export function topicPath(topic: 'objections' | 'competitors' | string): string {
  return `_${slugify(topic)}.md`;
}

const BACKLINK_RE = /\[\[([^\]]+)\]\]/g;

export function parseBacklinks(markdown: string): string[] {
  const seen = new Set<string>();
  for (const match of markdown.matchAll(BACKLINK_RE)) {
    const target = match[1].split('|')[0].trim();
    if (target) seen.add(target);
  }
  return Array.from(seen);
}

export function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}
