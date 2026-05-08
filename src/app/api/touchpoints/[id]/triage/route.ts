import { NextResponse } from 'next/server';
import { runTriageForTouchpoint } from '@/lib/agents/reply-triage-runner';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const aiTriage = await runTriageForTouchpoint(id);
    return NextResponse.json({ aiTriage });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Triage failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
