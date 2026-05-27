import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchOg } from '@/lib/og-fetch';

function parseUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.trim() === '') return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  const where: { projectId: string; tags?: { has: string } } = { projectId };
  if (tag) where.tags = { has: tag };

  const resources = await prisma.resource.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ resources });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const body = await request.json();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const parsedUrl = parseUrl(body.url);
  if (!parsedUrl) {
    return NextResponse.json({ error: 'url must be a valid URL' }, { status: 400 });
  }

  const og = await fetchOg(parsedUrl.toString());

  const resource = await prisma.resource.create({
    data: {
      projectId,
      url: parsedUrl.toString(),
      title: og.title ?? (typeof body.title === 'string' ? body.title : null),
      description: og.description ?? (typeof body.description === 'string' ? body.description : null),
      ogImage: og.ogImage ?? null,
      fetchedExcerpt: og.fetchedExcerpt ?? null,
      userNote: typeof body.userNote === 'string' && body.userNote.trim() !== '' ? body.userNote : null,
      tags: normalizeTags(body.tags),
    },
  });

  return NextResponse.json({ resource }, { status: 201 });
}
