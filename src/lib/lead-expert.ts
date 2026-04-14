import { prisma } from './db';
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES_ORDERED,
  PROJECT_CAMPAIGN_STAGE_LABELS,
  DECISION_MAKER_LABELS,
  CHANNEL_LABELS,
} from '@/types';
import { retrieveRelevantDocs, formatDocsForPrompt } from './wiki/retrieve';

export async function buildLeadExpertSystemPrompt(
  projectIds: string[],
  query: string = '',
): Promise<string> {
  const basePrompt = `You are a lead generation and sales strategy expert. You have deep knowledge of B2B outreach, pipeline management, and market positioning. You help users:

- Develop comprehensive market approach strategies with specific targets
- Prioritize leads based on engagement signals and fit
- Craft outreach sequences tailored to industries and personas
- Analyze pipeline health and identify bottlenecks
- Suggest new lead sources and prospecting strategies

Be specific, actionable, and data-driven. Reference the actual leads and project data provided below when giving advice. If no projects are selected, give general lead strategy advice.`;

  if (projectIds.length === 0) {
    return basePrompt + '\n\nNo projects are currently selected. Give general lead strategy advice and ask the user to select projects for personalized recommendations.';
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: {
      leads: {
        where: { status: 'ACTIVE' },
        include: {
          touchpoints: {
            orderBy: { sentAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { priorityScore: 'desc' },
      },
    },
  });

  if (projects.length === 0) {
    return basePrompt + '\n\nThe selected projects were not found.';
  }

  const projectSections = projects.map((project) => {
    const leads = project.leads;

    // Pipeline distribution
    const stageCounts: Record<string, number> = {};
    for (const stage of PIPELINE_STAGES_ORDERED) {
      stageCounts[stage] = leads.filter((l) => l.currentStage === stage).length;
    }
    const pipelineStr = PIPELINE_STAGES_ORDERED
      .filter((s) => stageCounts[s] > 0)
      .map((s) => `${PIPELINE_STAGE_LABELS[s]}(${stageCounts[s]})`)
      .join(' → ');

    // Avg score
    const avgScore = leads.length > 0
      ? Math.round(leads.reduce((sum, l) => sum + l.priorityScore, 0) / leads.length)
      : 0;

    // Role distribution
    const roleCounts: Record<string, number> = {};
    for (const lead of leads) {
      const label = DECISION_MAKER_LABELS[lead.role] || lead.role;
      roleCounts[label] = (roleCounts[label] || 0) + 1;
    }
    const rolesStr = Object.entries(roleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => `${role}: ${count}`)
      .join(', ');

    // Recent touchpoints (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    let recentTouchpoints = 0;
    let recentReplies = 0;
    for (const lead of leads) {
      for (const tp of lead.touchpoints) {
        if (tp.sentAt >= oneWeekAgo) {
          recentTouchpoints++;
          if (tp.gotReply) recentReplies++;
        }
      }
    }

    // Channel usage
    const channelCounts: Record<string, number> = {};
    for (const lead of leads) {
      for (const tp of lead.touchpoints) {
        const label = CHANNEL_LABELS[tp.channel] || tp.channel;
        channelCounts[label] = (channelCounts[label] || 0) + 1;
      }
    }
    const channelsStr = Object.entries(channelCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([ch, count]) => `${ch}: ${count}`)
      .join(', ');

    // Top 5 leads by score
    const topLeads = leads.slice(0, 5).map((l) => {
      const lastTouch = l.touchpoints[0];
      const lastTouchStr = lastTouch
        ? `last touch ${new Date(lastTouch.sentAt).toLocaleDateString()}`
        : 'no touchpoints';
      return `  - ${l.firstName} ${l.lastName} (${l.company}, ${l.title || 'Unknown title'}) — ${PIPELINE_STAGE_LABELS[l.currentStage]}, score: ${l.priorityScore}/100, ${lastTouchStr}`;
    }).join('\n');

    // Industries
    const industries = [...new Set(leads.map((l) => l.industry).filter(Boolean))];

    return `### Project: "${project.name}"
- Campaign Stage: ${PROJECT_CAMPAIGN_STAGE_LABELS[project.campaignStage] || project.campaignStage}
- Idea: ${project.idea || 'Not defined'}
- Approach: ${project.approach || 'Not defined'}
- Description: ${project.description || 'None'}
- Total Active Leads: ${leads.length}
- Pipeline: ${pipelineStr || 'Empty'}
- Avg Priority Score: ${avgScore}/100
- Roles: ${rolesStr || 'None'}
- Industries: ${industries.join(', ') || 'Not specified'}
- Channels Used: ${channelsStr || 'None'}
- Activity (last 7 days): ${recentTouchpoints} touchpoints, ${recentReplies} replies
- Top Leads by Score:
${topLeads || '  (none)'}`;
  });

  // Retrieve wiki context per project (only if wikiEnabled and query is non-empty)
  const wikiSections: string[] = [];
  if (query) {
    for (const project of projects) {
      if (!project.wikiEnabled) continue;
      const retrieved = await retrieveRelevantDocs(project.id, query, 8);
      if (retrieved.length === 0) continue;
      wikiSections.push(
        `### Wiki context for "${project.name}"\n\n${formatDocsForPrompt(retrieved)}`,
      );
    }
  }

  const wikiBlock = wikiSections.length > 0
    ? `\n\n## Wiki Context\n\nThe following wiki pages are most relevant to the user's question, retrieved from the project wiki. Treat these as authoritative context.\n\n${wikiSections.join('\n\n')}`
    : '';

  return `${basePrompt}

## Active Projects Context

${projectSections.join('\n\n')}${wikiBlock}

Use this data to give specific, contextual advice. Reference actual lead names, companies, and pipeline positions when relevant. If recommending actions, be specific about which leads to target and why.`;
}
