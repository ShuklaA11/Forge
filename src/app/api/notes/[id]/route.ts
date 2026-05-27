import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { NoteKind, Prisma } from '@prisma/client';
import { NOTE_KINDS_ORDERED } from '@/types';

function countLinks(linkedLeadId?: unknown, linkedCallId?: unknown, linkedInsightId?: unknown): number {
  return (
    (linkedLeadId ? 1 : 0) +
    (linkedCallId ? 1 : 0) +
    (linkedInsightId ? 1 : 0)
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  const data: Prisma.NoteUpdateInput = {};

  if (typeof body.title === 'string') {
    if (body.title.trim() === '') {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    }
    data.title = body.title;
  }
  if (typeof body.body === 'string') data.body = body.body;
  if (body.kind && (NOTE_KINDS_ORDERED as readonly string[]).includes(body.kind)) {
    data.kind = body.kind as NoteKind;
  }

  const nextLeadId = 'linkedLeadId' in body ? body.linkedLeadId : existing.linkedLeadId;
  const nextCallId = 'linkedCallId' in body ? body.linkedCallId : existing.linkedCallId;
  const nextInsightId = 'linkedInsightId' in body ? body.linkedInsightId : existing.linkedInsightId;
  if (countLinks(nextLeadId, nextCallId, nextInsightId) > 1) {
    return NextResponse.json(
      { error: 'A note can link to at most one of lead, call, or insight' },
      { status: 400 },
    );
  }
  if ('linkedLeadId' in body) data.linkedLead = body.linkedLeadId ? { connect: { id: body.linkedLeadId } } : { disconnect: true };
  if ('linkedCallId' in body) data.linkedCall = body.linkedCallId ? { connect: { id: body.linkedCallId } } : { disconnect: true };
  if ('linkedInsightId' in body) data.linkedInsight = body.linkedInsightId ? { connect: { id: body.linkedInsightId } } : { disconnect: true };

  const note = await prisma.note.update({ where: { id }, data });
  return NextResponse.json({ note });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
}
