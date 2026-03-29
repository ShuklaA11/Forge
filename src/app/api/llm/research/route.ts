import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateLLMResponseWithTools } from '@/lib/llm-agent';
import { PROJECT_CAMPAIGN_STAGE_LABELS } from '@/types';

export async function POST(request: Request) {
  try {
    const { projectId, query } = await request.json();

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const systemPrompt = `You are an expert B2B lead generation strategist. Help the user find leads matching their description.

Provide:
1. **Ideal Customer Profile (ICP)** — Key characteristics of the target lead
2. **Search Strategy** — Where and how to find these leads (specific directories, databases, LinkedIn search queries, industry associations)
3. **Qualification Criteria** — What makes a lead high-quality for this search
4. **Outreach Angles** — 2-3 potential value propositions to use when reaching out
5. **Estimated Volume** — Rough estimate of how many leads match this profile

Be specific and actionable. Include exact search terms, filters, and website URLs where applicable.`;

    const userPrompt = `I'm working on a campaign called "${project.name}".

Campaign details:
- Description: ${project.description || 'Not provided'}
- Idea / Goal: ${project.idea || 'Not provided'}
- Approach: ${project.approach || 'Not provided'}
- Current Stage: ${PROJECT_CAMPAIGN_STAGE_LABELS[project.campaignStage] || project.campaignStage}

I'm looking for leads matching this description:
${query}

Please provide a comprehensive lead research strategy.`;

    const suggestions = await generateLLMResponseWithTools([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const session = await prisma.researchSession.create({
      data: {
        projectId,
        query,
        aiSuggestions: { response: suggestions },
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ session, suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate research';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
