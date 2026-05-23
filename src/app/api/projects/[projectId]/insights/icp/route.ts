import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runIcpRefiner } from '@/lib/agents/icp-refiner';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  try {
    const insight = await runIcpRefiner(projectId);
    return NextResponse.json({ success: true, insight });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'icp-refiner failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const insights = await prisma.projectInsight.findMany({
    where: { projectId, kind: 'ICP_REFINEMENT' },
    orderBy: { generatedAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ insights });
}
