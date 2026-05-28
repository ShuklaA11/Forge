import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runNewsIngest } from '@/lib/agents/news-ingest';

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
    const result = await runNewsIngest(projectId);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'news-ingest failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
