import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  imputeCompanyFacts,
  listImputationProposals,
  persistProposals,
} from '@/lib/wiki/lint/imputation';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, kind, companyName } = body as {
      projectId?: string;
      kind?: string;
      companyName?: string;
    };

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (kind !== 'company') {
      return NextResponse.json(
        { error: "kind must be 'company' (other kinds not yet supported)" },
        { status: 400 },
      );
    }
    if (!companyName || typeof companyName !== 'string') {
      return NextResponse.json(
        { error: 'companyName is required' },
        { status: 400 },
      );
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

    const result = await imputeCompanyFacts(projectId, companyName);
    const persisted = await persistProposals(projectId, companyName, result.proposals);

    return NextResponse.json({
      companyName: result.companyName,
      missingFields: result.missingFields,
      searchCalls: result.searchCalls,
      llmCalls: result.llmCalls,
      created: persisted.created,
      updated: persisted.updated,
      rows: persisted.rows,
    });
  } catch (error) {
    console.error('Error running wiki imputation:', error);
    const message = error instanceof Error ? error.message : 'Failed to run imputation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const statusParam = url.searchParams.get('status') ?? 'OPEN';

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (statusParam !== 'OPEN' && statusParam !== 'DISMISSED' && statusParam !== 'RESOLVED') {
      return NextResponse.json(
        { error: 'status must be OPEN, DISMISSED, or RESOLVED' },
        { status: 400 },
      );
    }

    const rows = await listImputationProposals(projectId, statusParam);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error('Error listing wiki imputation proposals:', error);
    const message = error instanceof Error ? error.message : 'Failed to list proposals';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
