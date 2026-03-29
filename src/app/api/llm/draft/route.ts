import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateLLMResponseWithTools } from '@/lib/llm-agent';
import { PIPELINE_STAGE_LABELS, CHANNEL_LABELS, PROJECT_CAMPAIGN_STAGE_LABELS } from '@/types';

export async function POST(request: Request) {
  try {
    const { leadId, channel, context: additionalContext } = await request.json();

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        project: true,
        touchpoints: { orderBy: { sentAt: 'desc' }, take: 10 },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const touchpointSummary = lead.touchpoints.length > 0
      ? lead.touchpoints.map(t =>
          `- ${t.direction === 'OUTBOUND' ? 'Sent' : 'Received'} ${CHANNEL_LABELS[t.channel]} on ${new Date(t.sentAt).toLocaleDateString()}: ${t.subject || t.body?.slice(0, 100) || 'No content'}`
        ).join('\n')
      : 'No previous interactions.';

    const systemPrompt = `You are a professional business development assistant. Draft a personalized ${CHANNEL_LABELS[channel] || channel} message for outreach.

Keep the message:
- Professional but warm
- Concise (under 150 words for email, under 50 words for LinkedIn DM)
- Focused on value proposition
- Personalized to the recipient's role and company
- Aligned with the campaign idea, approach, and stage if provided — use these to understand the outreach goals and tailor tone accordingly

Do NOT include subject lines unless specifically for email. Just return the message body.`;

    const userPrompt = `Draft a ${CHANNEL_LABELS[channel] || channel} message for:

Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Title: ${lead.title || 'Unknown'}
Role Level: ${lead.role}
Industry: ${lead.industry || 'Unknown'}
Current Stage: ${PIPELINE_STAGE_LABELS[lead.currentStage]}
Project: ${lead.project.name}
Project Description: ${lead.project.description || 'None'}
Campaign Idea: ${lead.project.idea || 'None'}
Outreach Approach: ${lead.project.approach || 'None'}
Campaign Stage: ${PROJECT_CAMPAIGN_STAGE_LABELS[lead.project.campaignStage] || lead.project.campaignStage}

Previous interactions:
${touchpointSummary}

${additionalContext ? `Additional context: ${additionalContext}` : ''}`;

    const draft = await generateLLMResponseWithTools([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return NextResponse.json({ draft, channel });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate draft';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
