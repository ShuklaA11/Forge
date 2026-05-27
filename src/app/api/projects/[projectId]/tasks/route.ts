import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const url = new URL(request.url);
  const completedParam = url.searchParams.get('completed');

  const where: { projectId: string; completed?: boolean } = { projectId };
  if (completedParam === 'true') where.completed = true;
  else if (completedParam === 'false') where.completed = false;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [
      { completed: 'asc' },
      { dueAt: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  });
  return NextResponse.json({ tasks });
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

  let dueAt: Date | null = null;
  if (body.dueAt) {
    const parsed = new Date(body.dueAt);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'dueAt is not a valid date' }, { status: 400 });
    }
    dueAt = parsed;
  }

  const task = await prisma.task.create({
    data: {
      projectId,
      leadId: body.leadId || null,
      title: body.title,
      notes: body.notes || null,
      dueAt,
      completed: body.completed === true,
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
