import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { NoteKind } from '@prisma/client';
import { NOTE_KINDS_ORDERED } from '@/types';

function countLinks(body: {
  linkedLeadId?: string | null;
  linkedCallId?: string | null;
  linkedInsightId?: string | null;
}): number {
  return (
    (body.linkedLeadId ? 1 : 0) +
    (body.linkedCallId ? 1 : 0) +
    (body.linkedInsightId ? 1 : 0)
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const notes = await prisma.note.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ notes });
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

  if (typeof body.title !== 'string' || body.title.trim() === '') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (typeof body.body !== 'string') {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }

  const kind: NoteKind = body.kind && (NOTE_KINDS_ORDERED as readonly string[]).includes(body.kind)
    ? (body.kind as NoteKind)
    : 'NOTE';

  if (countLinks(body) > 1) {
    return NextResponse.json(
      { error: 'A note can link to at most one of lead, call, or insight' },
      { status: 400 },
    );
  }

  const note = await prisma.note.create({
    data: {
      projectId,
      kind,
      title: body.title,
      body: body.body,
      linkedLeadId: body.linkedLeadId || null,
      linkedCallId: body.linkedCallId || null,
      linkedInsightId: body.linkedInsightId || null,
    },
  });

  return NextResponse.json({ note }, { status: 201 });
}
