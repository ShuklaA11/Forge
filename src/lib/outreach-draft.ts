import { prisma } from './db';
import { generateLLMResponse } from './llm';
import {
  retrieveRelevantDocs,
  formatDocsForPrompt,
  toRetrievedSources,
  type RetrievedSource,
} from './wiki/retrieve';
import {
  CHANNEL_LABELS,
  PIPELINE_STAGE_LABELS,
  DECISION_MAKER_LABELS,
} from '@/types';

export interface OutreachDraft {
  subject: string;
  body: string;
  channel: 'EMAIL' | 'LINKEDIN' | 'PHONE' | 'OTHER';
  sources: RetrievedSource[];
}

const HISTORY_LIMIT = 6;
const WIKI_LIMIT = 4;

export function defaultChannel(email: string | null): OutreachDraft['channel'] {
  return email ? 'EMAIL' : 'LINKEDIN';
}

export function parseDraft(raw: string): { subject: string; body: string } {
  const subjectMatch = raw.match(/^\s*subject\s*:\s*(.+?)\s*$/im);
  const subject = subjectMatch ? subjectMatch[1].trim() : '';

  let body = raw;
  if (subjectMatch) {
    body = raw.slice(subjectMatch.index! + subjectMatch[0].length).trim();
  }
  body = body.replace(/^body\s*:\s*/im, '').trim();

  return { subject, body };
}

export async function draftNextOutreach(
  sequenceId: string,
  channelOverride?: OutreachDraft['channel'],
): Promise<OutreachDraft> {
  const sequence = await prisma.outreachSequence.findUnique({
    where: { id: sequenceId },
    include: {
      lead: {
        include: {
          project: true,
          touchpoints: {
            orderBy: { sentAt: 'desc' },
            take: HISTORY_LIMIT,
          },
        },
      },
    },
  });

  if (!sequence) throw new Error(`Sequence ${sequenceId} not found`);
  if (sequence.status !== 'ACTIVE') {
    throw new Error(`Sequence is ${sequence.status}, not ACTIVE`);
  }

  const { lead } = sequence;
  const { project } = lead;

  const channel = channelOverride ?? defaultChannel(lead.email);

  const historyStr = lead.touchpoints.length === 0
    ? '_No prior touchpoints — this is the first outreach._'
    : lead.touchpoints
        .map((tp, i) => {
          const when = new Date(tp.sentAt).toLocaleDateString();
          const dir = tp.direction === 'OUTBOUND' ? 'You sent' : 'They sent';
          const label = CHANNEL_LABELS[tp.channel] || tp.channel;
          const subj = tp.subject ? ` "${tp.subject}"` : '';
          const body = tp.body ? `\n   ${tp.body.slice(0, 400)}` : '';
          return `${i + 1}. [${when}] ${dir} via ${label}${subj}${body}`;
        })
        .join('\n');

  // Wiki retrieval grounded on the lead's company (if wiki is enabled)
  let wikiBlock = '';
  let sources: RetrievedSource[] = [];
  if (project.wikiEnabled) {
    const query = `${lead.company} ${lead.industry ?? ''}`.trim();
    const retrieved = await retrieveRelevantDocs(project.id, query, WIKI_LIMIT);
    if (retrieved.length > 0) {
      wikiBlock = `\n\n## Wiki Context\n\n${formatDocsForPrompt(retrieved, 1500)}`;
      sources = toRetrievedSources(retrieved, project.id, project.name);
    }
  }

  const stepLabel = `Step ${sequence.currentStep} of ${sequence.maxSteps}`;
  const stageLabel = PIPELINE_STAGE_LABELS[lead.currentStage] || lead.currentStage;
  const roleLabel = DECISION_MAKER_LABELS[lead.role] || lead.role;
  const channelLabel = CHANNEL_LABELS[channel] || channel;

  const systemPrompt = `You are a B2B outreach copywriter drafting the next message in a multi-step sequence. Match the channel's conventions, keep it concise, and reference prior context naturally without summarizing it back to the recipient. Avoid generic openers and corporate filler. Do not invent facts about the recipient or their company — only use what's in the context below.

Output exactly this format and nothing else:

Subject: <one line; for non-email channels write "n/a">
Body:
<message body>`;

  const userPrompt = `## Outreach Context

- Lead: ${lead.firstName} ${lead.lastName}, ${lead.title || 'Unknown title'} at ${lead.company}
- Role: ${roleLabel}
- Industry: ${lead.industry || 'unspecified'}
- Pipeline stage: ${stageLabel}
- Channel: ${channelLabel}
- Sequence: ${stepLabel} (cadence: every ${sequence.intervalDays} days)

## Project / Campaign

- Name: ${project.name}
- Idea: ${project.idea || 'unspecified'}
- Approach: ${project.approach || 'unspecified'}

## Touchpoint History (most recent first)

${historyStr}${wikiBlock}

Write the next outreach message now.`;

  const raw = await generateLLMResponse(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    800,
  );

  const { subject, body } = parseDraft(raw);

  return {
    subject: channel === 'EMAIL' ? subject : '',
    body: body || raw.trim(),
    channel,
    sources,
  };
}
