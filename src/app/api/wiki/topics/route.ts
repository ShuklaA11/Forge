import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { FIXED_TOPICS, discoverTopics, type DiscoveredTopic } from '@/lib/wiki/topics';
import { generate as generateTopic } from '@/lib/wiki/generators/topic';

async function loadProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, wikiEnabled: true },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const project = await loadProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (!project.wikiEnabled) {
    return NextResponse.json(
      { error: 'Wiki is not enabled for this project' },
      { status: 400 },
    );
  }

  let discovered: DiscoveredTopic[] = [];
  let discoverError: string | undefined;
  try {
    discovered = await discoverTopics(projectId);
  } catch (err) {
    discoverError = err instanceof Error ? err.message : String(err);
    console.error('discoverTopics failed:', err);
  }

  return NextResponse.json({
    fixed: [...FIXED_TOPICS],
    discovered,
    ...(discoverError ? { discoverError } : {}),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, topicKey } = body as { projectId?: string; topicKey?: string };

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!topicKey) {
      return NextResponse.json({ error: 'topicKey is required' }, { status: 400 });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!project.wikiEnabled) {
      return NextResponse.json(
        { error: 'Wiki is not enabled for this project' },
        { status: 400 },
      );
    }

    const result = await generateTopic(projectId, topicKey);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error materializing topic:', error);
    const message = error instanceof Error ? error.message : 'Failed to materialize topic';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
