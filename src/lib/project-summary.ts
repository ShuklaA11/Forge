import { prisma } from './db';
import { generateLLMResponse } from './llm';
import { PIPELINE_STAGE_LABELS } from '@/types';

interface SummaryResult {
  summary: string;
  insights: string;
}

export async function generateProjectSummary(
  projectId: string,
): Promise<SummaryResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true, idea: true, approach: true, campaignStage: true },
  });

  if (!project) throw new Error('Project not found');

  // Fetch cached company summaries
  const companySummaries = await prisma.companySummary.findMany({
    where: { projectId },
    orderBy: { generatedAt: 'desc' },
  });

  // Get lead stats
  const leads = await prisma.lead.findMany({
    where: { projectId, status: 'ACTIVE' },
    select: { company: true, currentStage: true, conversationStage: true, priorityScore: true },
  });

  const companies = [...new Set(leads.map((l) => l.company))];
  const stageDistribution = leads.reduce((acc, l) => {
    const label = PIPELINE_STAGE_LABELS[l.currentStage] || l.currentStage;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const projectContext = [
    project.description && `Description: ${project.description}`,
    project.idea && `Core Idea: ${project.idea}`,
    project.approach && `Approach: ${project.approach}`,
  ].filter(Boolean).join('\n');

  const companySections = companySummaries.map((cs) => {
    const leadCount = leads.filter((l) => l.company === cs.companyName).length;
    return `### ${cs.companyName} (${leadCount} contact${leadCount !== 1 ? 's' : ''})
${cs.summary}
Flags: ${cs.insights}`;
  }).join('\n\n');

  const companiesWithoutSummaries = companies.filter(
    (c) => !companySummaries.some((cs) => cs.companyName === c)
  );
  const unsummarizedSection = companiesWithoutSummaries.length > 0
    ? `\n\nCompanies without summaries yet: ${companiesWithoutSummaries.join(', ')}`
    : '';

  const systemPrompt = `You are a strategic business analyst producing a project-level summary from company-level intelligence.

Respond with EXACTLY two sections separated by "---INSIGHTS---":

SECTION 1 (Summary): A concise 4-6 sentence overview of the project's current state. Cover: overall market signal strength, common themes across companies, where the project stands in validation/sales, and momentum direction.

SECTION 2 (Insights & Flags): Bullet points with cross-company patterns and strategic flags:
- Contradictions between companies (e.g., one says pricing is fine, another says too expensive)
- Patterns that validate or invalidate the project thesis
- Companies going cold or sentiment trending down
- Strongest opportunities and warmest leads
- Gaps in coverage (stages not represented, company types missing)
- Recommended priorities or next moves

If there are no flags, say "No significant flags at this time."

Do NOT use markdown headers. Just plain text for the summary, then "---INSIGHTS---", then bullet points.`;

  const userPrompt = `## Project: ${project.name}
${projectContext}
Campaign Stage: ${project.campaignStage}

## Stats
- ${companies.length} companies, ${leads.length} active leads
- Pipeline: ${Object.entries(stageDistribution).map(([s, n]) => `${s}: ${n}`).join(', ')}
- Avg priority score: ${leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.priorityScore, 0) / leads.length) : 0}

## Company Intelligence
${companySections || 'No company summaries generated yet.'}${unsummarizedSection}`;

  const response = await generateLLMResponse([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], 2048);

  return parseSummaryResponse(response);
}

export async function saveProjectSummary(
  projectId: string,
): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: { projectId, status: 'ACTIVE' },
    select: { company: true },
  });

  const companies = [...new Set(leads.map((l) => l.company))];
  const result = await generateProjectSummary(projectId);

  await prisma.projectSummary.upsert({
    where: { projectId },
    create: {
      projectId,
      summary: result.summary,
      insights: result.insights,
      companyCount: companies.length,
      leadCount: leads.length,
      generatedAt: new Date(),
    },
    update: {
      summary: result.summary,
      insights: result.insights,
      companyCount: companies.length,
      leadCount: leads.length,
      generatedAt: new Date(),
    },
  });
}

function parseSummaryResponse(raw: string): SummaryResult {
  const parts = raw.split('---INSIGHTS---');
  return {
    summary: (parts[0] || '').trim(),
    insights: (parts[1] || 'No significant flags at this time.').trim(),
  };
}
