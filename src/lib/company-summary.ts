import { prisma } from './db';
import { generateLLMResponse } from './llm';
import { PIPELINE_STAGE_LABELS, CONVERSATION_STAGE_LABELS } from '@/types';

interface SummaryResult {
  summary: string;
  insights: string;
  nextSteps: string;
}

export async function generateCompanySummary(
  projectId: string,
  companyName: string,
): Promise<SummaryResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true, idea: true, approach: true, campaignStage: true },
  });

  if (!project) throw new Error('Project not found');

  const leads = await prisma.lead.findMany({
    where: { projectId, company: companyName, status: 'ACTIVE' },
    include: {
      calls: {
        orderBy: { callDate: 'desc' },
        select: {
          title: true,
          callDate: true,
          structuredNotes: true,
          sentiment: true,
          sentimentScore: true,
          manualNotes: true,
        },
      },
    },
  });

  if (leads.length === 0) throw new Error(`No leads found at ${companyName}`);

  // Build context for each lead
  const leadContexts = leads.map((lead) => {
    const callSummaries = lead.calls.map((call) => {
      const notes = call.structuredNotes as Record<string, unknown> | null;
      return `  - ${call.title} (${call.callDate.toISOString().split('T')[0]}): ${notes?.summary || call.manualNotes || 'No notes'} [Sentiment: ${call.sentiment || 'unknown'}]`;
    }).join('\n');

    return `### ${lead.firstName} ${lead.lastName}${lead.title ? ` — ${lead.title}` : ''}
Pipeline: ${PIPELINE_STAGE_LABELS[lead.currentStage] || lead.currentStage}
Conversation: ${CONVERSATION_STAGE_LABELS[lead.conversationStage] || lead.conversationStage}
${lead.notes ? `Notes: ${lead.notes}` : ''}
Calls (${lead.calls.length}):
${callSummaries || '  No calls logged'}`;
  }).join('\n\n');

  const projectContext = [
    project.description && `Description: ${project.description}`,
    project.idea && `Core Idea: ${project.idea}`,
    project.approach && `Approach: ${project.approach}`,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are a strategic business analyst helping evaluate a company relationship within a project.

Respond with EXACTLY three sections separated by "---INSIGHTS---" and "---NEXT_STEPS---":

SECTION 1 (Summary): A concise 3-5 sentence summary of the relationship with this company. Cover: overall status, key themes from conversations, sentiment direction, and where the relationship stands.

SECTION 2 (Insights & Flags): Bullet points flagging important patterns, risks, and contradictions. Include:
- Contradictions between different contacts at this company
- Stalled or cooling conversations
- Gaps between what they're saying and the project thesis
- Opportunities or strong validation signals
- Overdue follow-ups or dropped commitments

If there are no flags, say "No significant flags at this time."

SECTION 3 (Next Steps): A prioritized bullet-point list of 2-5 concrete, actionable next steps to advance this relationship. Each step should be specific (who to contact, what to discuss, what to send). Base these on conversation history, commitments made, and current pipeline stage.

Do NOT use markdown headers. Just plain text for the summary, then "---INSIGHTS---", then bullet points, then "---NEXT_STEPS---", then bullet points.`;

  const userPrompt = `## Project: ${project.name}
${projectContext}
Campaign Stage: ${project.campaignStage}

## Company: ${companyName}
Contacts (${leads.length}):

${leadContexts}`;

  const response = await generateLLMResponse([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], 2048);

  return parseSummaryResponse(response);
}

export async function saveCompanySummary(
  projectId: string,
  companyName: string,
): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: { projectId, company: companyName, status: 'ACTIVE' },
    select: { id: true },
  });

  const lastCall = await prisma.call.findFirst({
    where: { lead: { projectId, company: companyName } },
    orderBy: { callDate: 'desc' },
    select: { callDate: true },
  });

  const result = await generateCompanySummary(projectId, companyName);

  await prisma.companySummary.upsert({
    where: { projectId_companyName: { projectId, companyName } },
    create: {
      projectId,
      companyName,
      summary: result.summary,
      insights: result.insights,
      nextSteps: result.nextSteps,
      leadsIncluded: leads.map((l) => l.id),
      lastCallDate: lastCall?.callDate || null,
      generatedAt: new Date(),
    },
    update: {
      summary: result.summary,
      insights: result.insights,
      nextSteps: result.nextSteps,
      leadsIncluded: leads.map((l) => l.id),
      lastCallDate: lastCall?.callDate || null,
      generatedAt: new Date(),
    },
  });
}

function parseSummaryResponse(raw: string): SummaryResult {
  const insightsSplit = raw.split('---INSIGHTS---');
  const summary = (insightsSplit[0] || '').trim();
  const rest = insightsSplit[1] || '';
  const nextStepsSplit = rest.split('---NEXT_STEPS---');
  return {
    summary,
    insights: (nextStepsSplit[0] || 'No significant flags at this time.').trim(),
    nextSteps: (nextStepsSplit[1] || '').trim(),
  };
}
