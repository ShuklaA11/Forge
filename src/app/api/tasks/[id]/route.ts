import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const data: Prisma.TaskUpdateInput = {};

  if (typeof body.title === 'string') {
    if (body.title.trim() === '') {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    }
    data.title = body.title;
  }
  if ('notes' in body) data.notes = body.notes || null;
  if (typeof body.completed === 'boolean') data.completed = body.completed;
  if ('dueAt' in body) {
    if (body.dueAt === null || body.dueAt === '') {
      data.dueAt = null;
    } else {
      const parsed = new Date(body.dueAt);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'dueAt is not a valid date' }, { status: 400 });
      }
      data.dueAt = parsed;
    }
  }
  if ('leadId' in body) {
    data.lead = body.leadId ? { connect: { id: body.leadId } } : { disconnect: true };
  }

  const task = await prisma.task.update({ where: { id }, data });
  return NextResponse.json({ task });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
}
