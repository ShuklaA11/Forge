import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { applyProposal } from '@/lib/wiki/lint/imputation';

type FindingStatus = 'OPEN' | 'DISMISSED' | 'RESOLVED';
type PatchStatus = FindingStatus | 'APPLIED';

const TERMINAL_STATUSES: FindingStatus[] = ['DISMISSED', 'RESOLVED'];
const VALID_STATUSES: PatchStatus[] = ['OPEN', 'DISMISSED', 'RESOLVED', 'APPLIED'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body as { status?: string };

    if (!VALID_STATUSES.includes(status as PatchStatus)) {
      return NextResponse.json(
        { error: 'status must be OPEN, DISMISSED, RESOLVED, or APPLIED' },
        { status: 400 },
      );
    }

    const finding = await prisma.wikiLintFinding.findUnique({
      where: { id },
      select: { id: true, kind: true, projectId: true },
    });
    if (!finding) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    if (finding.kind !== 'MISSING_DATA') {
      return NextResponse.json(
        { error: 'This endpoint only updates MISSING_DATA findings' },
        { status: 400 },
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: finding.projectId },
      select: { wikiEnabled: true },
    });
    if (!project?.wikiEnabled) {
      return NextResponse.json(
        { error: 'Wiki is not enabled for this project' },
        { status: 400 },
      );
    }

    if (status === 'APPLIED') {
      const result = await applyProposal(id);
      const row = await prisma.wikiLintFinding.findUnique({ where: { id } });
      return NextResponse.json({ row, applied: result });
    }

    const finalStatus = status as FindingStatus;
    const row = await prisma.wikiLintFinding.update({
      where: { id },
      data: {
        status: finalStatus,
        resolvedAt: TERMINAL_STATUSES.includes(finalStatus) ? new Date() : null,
      },
    });

    return NextResponse.json({ row });
  } catch (error) {
    console.error('Error updating wiki imputation proposal:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update proposal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
