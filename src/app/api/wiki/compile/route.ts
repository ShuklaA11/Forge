import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { compileProject, type CompileScope, type GeneratorRegistry } from '@/lib/wiki/compile';
import { generate as generateCompany } from '@/lib/wiki/generators/company';
import { generate as generatePerson } from '@/lib/wiki/generators/person';
import { generate as generateCall } from '@/lib/wiki/generators/call';
import { generate as generateProjectIndex } from '@/lib/wiki/generators/project-index';
import { generate as generateTopic } from '@/lib/wiki/generators/topic';

function buildRegistry(): GeneratorRegistry {
  return {
    generateCompany: (pid, name) => generateCompany(pid, name),
    generatePerson: (pid, leadId) => generatePerson(pid, leadId),
    generateCall: (pid, callId) => generateCall(pid, callId),
    generateProjectIndex: (pid) => generateProjectIndex(pid),
    generateTopic: (pid, topicKey) => generateTopic(pid, topicKey),
  };
}

function isValidScope(scope: unknown): scope is CompileScope {
  if (!scope || typeof scope !== 'object') return false;
  const s = scope as Record<string, unknown>;
  switch (s.kind) {
    case 'all':
      return true;
    case 'company':
      return typeof s.companyName === 'string' && s.companyName.length > 0;
    case 'lead':
      return typeof s.leadId === 'string' && s.leadId.length > 0;
    case 'call':
      return typeof s.callId === 'string' && s.callId.length > 0;
    case 'topic':
      return typeof s.topicKey === 'string' && s.topicKey.length > 0;
    default:
      return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, scope } = body as { projectId?: string; scope?: unknown };

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (scope === undefined || scope === null) {
      return NextResponse.json(
        { error: 'scope is required (e.g. { kind: "all" } or { kind: "call", callId })' },
        { status: 400 },
      );
    }
    if (!isValidScope(scope)) {
      return NextResponse.json({ error: 'Invalid scope shape' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, wikiEnabled: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!project.wikiEnabled) {
      return NextResponse.json(
        { error: 'Wiki is not enabled for this project' },
        { status: 400 },
      );
    }

    const result = await compileProject(projectId, scope, buildRegistry());
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error compiling wiki:', error);
    const message = error instanceof Error ? error.message : 'Failed to compile wiki';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
