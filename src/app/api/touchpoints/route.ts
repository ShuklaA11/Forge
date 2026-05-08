import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePriorityScore } from '@/lib/scoring';
import { runTriageInBackground } from '@/lib/agents/reply-triage-runner';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');

  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  }

  const touchpoints = await prisma.touchpoint.findMany({
    where: { leadId },
    orderBy: { sentAt: 'desc' },
  });

  return NextResponse.json(touchpoints);
}

export async function POST(request: Request) {
  const body = await request.json();

  const touchpoint = await prisma.touchpoint.create({
    data: {
      leadId: body.leadId,
      channel: body.channel,
      direction: body.direction,
      type: body.type,
      subject: body.subject || null,
      body: body.body || null,
      sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
      gotReply: body.gotReply || false,
      notes: body.notes || null,
    },
  });

  const sequence = await prisma.outreachSequence.findUnique({
    where: { leadId: body.leadId },
  });

  if (sequence && sequence.status === 'ACTIVE') {
    if (body.direction === 'INBOUND' || body.gotReply) {
      // Lead replied — sequence is done.
      await prisma.outreachSequence.update({
        where: { id: sequence.id },
        data: { status: 'COMPLETED' },
      });
    } else if (body.direction === 'OUTBOUND') {
      const nextStep = sequence.currentStep + 1;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + sequence.intervalDays);

      await prisma.outreachSequence.update({
        where: { id: sequence.id },
        data: {
          currentStep: nextStep,
          nextTouchDate: nextDate,
          status: nextStep > sequence.maxSteps ? 'EXHAUSTED' : 'ACTIVE',
        },
      });
    }
  }

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

  if (touchpoint.direction === 'INBOUND') {
    runTriageInBackground(touchpoint.id);
  }

  return NextResponse.json(touchpoint, { status: 201 });
}
