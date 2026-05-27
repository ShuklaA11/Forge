import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  const where: { projectId: string; name?: string } = { projectId };
  if (name) where.name = name;

  const metrics = await prisma.metric.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
  });
  return NextResponse.json({ metrics });
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

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (typeof body.value !== 'number' || !Number.isFinite(body.value)) {
    return NextResponse.json({ error: 'value must be a finite number' }, { status: 400 });
  }

  let recordedAt: Date | undefined;
  if (body.recordedAt) {
    const parsed = new Date(body.recordedAt);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'recordedAt is not a valid date' }, { status: 400 });
    }
    recordedAt = parsed;
  }

  const metric = await prisma.metric.create({
    data: {
      projectId,
      name: body.name,
      value: body.value,
      unit: body.unit || null,
      ...(recordedAt ? { recordedAt } : {}),
    },
  });

  return NextResponse.json({ metric }, { status: 201 });
}
