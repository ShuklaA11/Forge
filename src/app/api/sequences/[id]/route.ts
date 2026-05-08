import { NextResponse } from 'next/server';
import type { SequenceStatus } from '@prisma/client';
import { deleteSequence, updateSequenceStatus } from '@/lib/outreach';

const ALLOWED_STATUSES: SequenceStatus[] = [
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'EXHAUSTED',
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.status || !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const sequence = await updateSequenceStatus(id, body.status);
    return NextResponse.json(sequence);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update sequence';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteSequence(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to delete sequence';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
