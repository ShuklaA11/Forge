import { NextResponse } from 'next/server';
import { createSequence, getDueSequences } from '@/lib/outreach';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectIdsParam = searchParams.get('projectIds');
  const projectIds = projectIdsParam
    ? projectIdsParam.split(',').filter(Boolean)
    : undefined;

  const due = await getDueSequences(projectIds);
  return NextResponse.json(due);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.leadId || typeof body.leadId !== 'string') {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  }

  try {
    const sequence = await createSequence({
      leadId: body.leadId,
      templateUsed: body.templateUsed ?? null,
      maxSteps: typeof body.maxSteps === 'number' ? body.maxSteps : undefined,
      intervalDays:
        typeof body.intervalDays === 'number' ? body.intervalDays : undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
    });
    return NextResponse.json(sequence, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create sequence';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
