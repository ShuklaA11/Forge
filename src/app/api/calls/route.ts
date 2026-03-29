import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePriorityScore } from '@/lib/scoring';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');

  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  }

  const calls = await prisma.call.findMany({
    where: { leadId },
    orderBy: { callDate: 'desc' },
    include: { annotations: true },
  });

  return NextResponse.json(calls);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.leadId || !body.title || !body.callDate) {
      return NextResponse.json(
        { error: 'leadId, title, and callDate are required' },
        { status: 400 }
      );
    }

    // Auto-create a Touchpoint for the activity timeline
    const touchpoint = await prisma.touchpoint.create({
      data: {
        leadId: body.leadId,
        channel: 'PHONE',
        direction: 'INBOUND',
        type: 'MEETING',
        subject: body.title,
        body: body.manualNotes || null,
        sentAt: new Date(body.callDate),
        gotReply: true,
        notes: null,
      },
    });

    const call = await prisma.call.create({
      data: {
        leadId: body.leadId,
        title: body.title,
        callDate: new Date(body.callDate),
        durationMinutes: body.durationMinutes || null,
        audioFilePath: body.audioFilePath || null,
        transcript: body.transcript || null,
        manualNotes: body.manualNotes || null,
        structuredNotes: body.structuredNotes || null,
        sentiment: body.sentiment || null,
        sentimentScore: body.sentimentScore || null,
        touchpointId: touchpoint.id,
      },
      include: { annotations: true },
    });

    // Recalculate lead priority score
    const lead = await prisma.lead.findUnique({
      where: { id: body.leadId },
      include: { touchpoints: true, outreachSequence: true },
    });

    if (lead) {
      const score = calculatePriorityScore({
        lead,
        touchpoints: lead.touchpoints,
        outreachSequence: lead.outreachSequence,
      });

      await prisma.lead.update({
        where: { id: body.leadId },
        data: { priorityScore: score },
      });
    }

    return NextResponse.json(call, { status: 201 });
  } catch (error) {
    console.error('Error creating call:', error);
    return NextResponse.json(
      { error: 'Failed to create call' },
      { status: 500 }
    );
  }
}
