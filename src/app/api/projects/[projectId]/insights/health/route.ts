import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runPipelineHealth } from '@/lib/agents/pipeline-health';

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
    const insight = await runPipelineHealth(projectId);
    return NextResponse.json({ success: true, insight });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'pipeline-health failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const insights = await prisma.projectInsight.findMany({
    where: { projectId, kind: 'PIPELINE_HEALTH' },
    orderBy: { generatedAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ insights });
}
