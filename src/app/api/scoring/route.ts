import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePriorityScore } from '@/lib/scoring';

export async function POST(request: Request) {
  const { leadId } = await request.json();

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { touchpoints: true, outreachSequence: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const score = calculatePriorityScore({
    lead,
    touchpoints: lead.touchpoints,
    outreachSequence: lead.outreachSequence,
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { priorityScore: score },
  });

  return NextResponse.json({ leadId, score });
}

export async function PUT() {
  const leads = await prisma.lead.findMany({
    where: { status: 'ACTIVE' },
    include: { touchpoints: true, outreachSequence: true },
  });

  const updates = await Promise.all(
    leads.map(async (lead) => {
      const score = calculatePriorityScore({
        lead,
        touchpoints: lead.touchpoints,
        outreachSequence: lead.outreachSequence,
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: { priorityScore: score },
      });

      return { leadId: lead.id, score };
    })
  );

  return NextResponse.json({ updated: updates.length, scores: updates });
}
