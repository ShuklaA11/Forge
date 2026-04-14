import { createHash } from 'crypto';
import type { Prisma, WikiDocument, WikiDocumentKind } from '@prisma/client';
import { prisma } from '../db';
import { normalizeContent, parseBacklinks } from './paths';

export interface WikiSource {
  type: 'call' | 'touchpoint' | 'lead' | 'project' | 'summary' | 'wiki';
  id: string;
}

export interface WikiFrontmatter {
  title: string;
  backlinks: string[];
  [key: string]: unknown;
}

export interface WriteDocInput {
  projectId: string;
  path: string;
  kind: WikiDocumentKind;
  content: string;
  frontmatter: { title: string; backlinks?: string[]; [key: string]: unknown };
  sources: WikiSource[];
}

export interface WriteDocResult {
  doc: WikiDocument;
  created: boolean;
  versionBumped: boolean;
}

function hashContent(normalized: string, frontmatter: WikiFrontmatter): string {
  const fmCanonical = JSON.stringify(frontmatter, Object.keys(frontmatter).sort());
  return createHash('sha256').update(fmCanonical).update('\n').update(normalized).digest('hex');
}

export async function readLatest(
  projectId: string,
  path: string,
): Promise<WikiDocument | null> {
  return prisma.wikiDocument.findFirst({
    where: { projectId, path, supersededById: null },
    orderBy: { version: 'desc' },
  });
}

export async function readVersion(
  projectId: string,
  path: string,
  version: number,
): Promise<WikiDocument | null> {
  return prisma.wikiDocument.findUnique({
    where: { projectId_path_version: { projectId, path, version } },
  });
}

export async function listByKind(
  projectId: string,
  kind: WikiDocumentKind,
): Promise<WikiDocument[]> {
  return prisma.wikiDocument.findMany({
    where: { projectId, kind, supersededById: null },
    orderBy: { path: 'asc' },
  });
}

export async function listAllLatest(projectId: string): Promise<WikiDocument[]> {
  return prisma.wikiDocument.findMany({
    where: { projectId, supersededById: null },
    orderBy: { path: 'asc' },
  });
}

export async function writeDoc(input: WriteDocInput): Promise<WriteDocResult> {
  const normalized = normalizeContent(input.content);
  const parsedBacklinks = parseBacklinks(normalized);
  const declared = input.frontmatter.backlinks ?? [];
  const backlinks = Array.from(new Set([...declared, ...parsedBacklinks]));

  const frontmatter: WikiFrontmatter = {
    ...input.frontmatter,
    backlinks,
  };

  const contentHash = hashContent(normalized, frontmatter);

  const prior = await readLatest(input.projectId, input.path);

  if (prior && prior.contentHash === contentHash) {
    return { doc: prior, created: false, versionBumped: false };
  }

  const nextVersion = prior ? prior.version + 1 : 1;

  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.wikiDocument.create({
      data: {
        projectId: input.projectId,
        path: input.path,
        kind: input.kind,
        version: nextVersion,
        frontmatter: frontmatter as unknown as Prisma.InputJsonValue,
        content: normalized,
        contentHash,
        sources: input.sources as unknown as Prisma.InputJsonValue,
      },
    });

    if (prior) {
      await tx.wikiDocument.update({
        where: { id: prior.id },
        data: { supersededById: created.id },
      });
    }

    return created;
  });

  return { doc, created: !prior, versionBumped: !!prior };
}

export async function getBacklinks(
  projectId: string,
  targetPath: string,
): Promise<WikiDocument[]> {
  const all = await listAllLatest(projectId);
  return all.filter((doc) => {
    const fm = doc.frontmatter as { backlinks?: unknown } | null;
    const bl = Array.isArray(fm?.backlinks) ? (fm!.backlinks as unknown[]) : [];
    return bl.some((b) => typeof b === 'string' && b === targetPath);
  });
}

export async function getHistory(
  projectId: string,
  path: string,
): Promise<WikiDocument[]> {
  return prisma.wikiDocument.findMany({
    where: { projectId, path },
    orderBy: { version: 'asc' },
  });
}
