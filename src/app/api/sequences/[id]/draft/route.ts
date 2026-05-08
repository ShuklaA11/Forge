import { NextResponse } from 'next/server';
import { draftNextOutreach, type OutreachDraft } from '@/lib/outreach-draft';

const ALLOWED_CHANNELS: OutreachDraft['channel'][] = [
  'EMAIL',
  'LINKEDIN',
  'PHONE',
  'OTHER',
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const channel: OutreachDraft['channel'] | undefined =
    body.channel && ALLOWED_CHANNELS.includes(body.channel)
      ? body.channel
      : undefined;

  try {
    const draft = await draftNextOutreach(id, channel);
    return NextResponse.json(draft);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to draft outreach';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
