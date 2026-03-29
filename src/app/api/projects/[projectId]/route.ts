import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { _count: { select: { leads: true } } },
  });
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();
  const project = await prisma.project.update({
    where: { id: projectId },
    data: body,
  });
  return NextResponse.json(project);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { status: 'ARCHIVED' },
  });
  return NextResponse.json(project);
}
