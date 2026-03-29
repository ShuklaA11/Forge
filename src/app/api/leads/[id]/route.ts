import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePriorityScore } from '@/lib/scoring';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, color: true } },
      stageHistory: { orderBy: { enteredAt: 'desc' } },
      touchpoints: { orderBy: { sentAt: 'desc' } },
      outreachSequence: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  return NextResponse.json(lead);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.currentStage) {
    const existingLead = await prisma.lead.findUnique({ where: { id } });
    if (existingLead && existingLead.currentStage !== body.currentStage) {
      await prisma.leadStageHistory.updateMany({
        where: { leadId: id, exitedAt: null },
        data: { exitedAt: new Date() },
      });
      await prisma.leadStageHistory.create({
        data: { leadId: id, stage: body.currentStage },
      });
    }
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: body,
    include: {
      touchpoints: true,
      outreachSequence: true,
    },
  });

  const score = calculatePriorityScore({
    lead,
    touchpoints: lead.touchpoints,
    outreachSequence: lead.outreachSequence,
  });

  const updatedLead = await prisma.lead.update({
    where: { id },
    data: { priorityScore: score },
    include: {
      project: { select: { id: true, name: true, color: true } },
      stageHistory: { orderBy: { enteredAt: 'desc' } },
      touchpoints: { orderBy: { sentAt: 'desc' } },
      outreachSequence: true,
    },
  });

  return NextResponse.json(updatedLead);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
