import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { saveProjectSummary } from '@/lib/project-summary';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const summary = await prisma.projectSummary.findUnique({
    where: { projectId },
  });

  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    await saveProjectSummary(projectId);

    const summary = await prisma.projectSummary.findUnique({
      where: { projectId },
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error generating project summary:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
