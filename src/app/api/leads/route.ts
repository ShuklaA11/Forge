import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePriorityScore } from '@/lib/scoring';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const stage = searchParams.get('stage');

  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (stage) where.currentStage = stage;

  const leads = await prisma.lead.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, color: true } },
      touchpoints: { orderBy: { sentAt: 'desc' }, take: 5 },
      outreachSequence: true,
      _count: { select: { touchpoints: true } },
    },
    orderBy: { priorityScore: 'desc' },
  });

  return NextResponse.json(leads);
}

export async function POST(request: Request) {
  const body = await request.json();

  const lead = await prisma.lead.create({
    data: {
      projectId: body.projectId,
      firstName: body.firstName,
      lastName: body.lastName,
      company: body.company,
      title: body.title || null,
      role: body.role || 'OTHER',
      email: body.email || null,
      phone: body.phone || null,
      linkedinUrl: body.linkedinUrl || null,
      companySize: body.companySize || null,
      companyType: body.companyType || null,
      industry: body.industry || null,
      location: body.location || null,
      source: body.source || 'MANUAL',
      notes: body.notes || null,
      stageHistory: {
        create: { stage: 'RESEARCHED' },
      },
    },
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
    where: { id: lead.id },
    data: { priorityScore: score },
    include: {
      project: { select: { id: true, name: true, color: true } },
      stageHistory: true,
      touchpoints: true,
      outreachSequence: true,
    },
  });

  return NextResponse.json(updatedLead, { status: 201 });
}
