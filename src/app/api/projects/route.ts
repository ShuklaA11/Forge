import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    include: {
      _count: { select: { leads: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();
  const project = await prisma.project.create({
    data: {
      name: body.name,
      description: body.description || null,
      idea: body.idea || null,
      approach: body.approach || null,
      campaignStage: body.campaignStage || 'IDEATION',
      color: body.color || '#6366f1',
    },
  });
  return NextResponse.json(project, { status: 201 });
}
