import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { saveCompanySummary } from '@/lib/company-summary';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const companyName = searchParams.get('companyName');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  if (companyName) {
    const summary = await prisma.companySummary.findUnique({
      where: { projectId_companyName: { projectId, companyName } },
    });
    return NextResponse.json(summary);
  }

  // Return all company summaries for the project
  const summaries = await prisma.companySummary.findMany({
    where: { projectId },
    orderBy: { generatedAt: 'desc' },
  });
  return NextResponse.json(summaries);
}

export async function POST(request: Request) {
  try {
    const { projectId, companyName } = await request.json();

    if (!projectId || !companyName) {
      return NextResponse.json(
        { error: 'projectId and companyName are required' },
        { status: 400 }
      );
    }

    await saveCompanySummary(projectId, companyName);

    const summary = await prisma.companySummary.findUnique({
      where: { projectId_companyName: { projectId, companyName } },
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error generating company summary:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
