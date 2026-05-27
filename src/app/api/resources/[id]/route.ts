import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.resource.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  const data: Prisma.ResourceUpdateInput = {};

  if (typeof body.url === 'string') {
    try {
      data.url = new URL(body.url).toString();
    } catch {
      return NextResponse.json({ error: 'url must be a valid URL' }, { status: 400 });
    }
  }
  if ('title' in body) data.title = body.title || null;
  if ('description' in body) data.description = body.description || null;
  if ('ogImage' in body) data.ogImage = body.ogImage || null;
  if ('fetchedExcerpt' in body) data.fetchedExcerpt = body.fetchedExcerpt || null;
  if ('userNote' in body) {
    data.userNote = typeof body.userNote === 'string' && body.userNote.trim() !== '' ? body.userNote : null;
  }
  if ('tags' in body) data.tags = normalizeTags(body.tags);

  const resource = await prisma.resource.update({ where: { id }, data });
  return NextResponse.json({ resource });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.resource.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }
}
