import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePriorityScore } from '@/lib/scoring';

export async function POST(request: Request) {
  const { projectId, leads: leadsData } = await request.json();

  if (!projectId || !Array.isArray(leadsData) || leadsData.length === 0) {
    return NextResponse.json(
      { error: 'projectId and a non-empty leads array are required' },
      { status: 400 }
    );
  }

  const results: { success: number; errors: { row: number; error: string }[] } = {
    success: 0,
    errors: [],
  };

  for (let i = 0; i < leadsData.length; i++) {
    const row = leadsData[i];

    if (!row.firstName || !row.lastName || !row.company) {
      results.errors.push({
        row: i + 1,
        error: `Missing required field(s): ${[
          !row.firstName && 'firstName',
          !row.lastName && 'lastName',
          !row.company && 'company',
        ].filter(Boolean).join(', ')}`,
      });
      continue;
    }

    try {
      const lead = await prisma.lead.create({
        data: {
          projectId,
          firstName: row.firstName,
          lastName: row.lastName,
          company: row.company,
          title: row.title || null,
          role: row.role || 'OTHER',
          email: row.email || null,
          phone: row.phone || null,
          linkedinUrl: row.linkedinUrl || null,
          companySize: row.companySize || null,
          companyType: row.companyType || null,
          industry: row.industry || null,
          location: row.location || null,
          source: row.source || 'MANUAL',
          notes: row.notes || null,
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

      await prisma.lead.update({
        where: { id: lead.id },
        data: { priorityScore: score },
      });

      results.success++;
    } catch (err) {
      results.errors.push({
        row: i + 1,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json(results, {
    status: results.errors.length > 0 && results.success === 0 ? 400 : 201,
  });
}
