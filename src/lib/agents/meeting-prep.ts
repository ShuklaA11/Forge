import { z } from 'zod';
import { runAgent, type LLMCaller } from './runtime';

export interface MeetingPrepBrief {
  historyRecap: string;
  recentSignals: string[];
  suggestedQuestions: string[];
  likelyObjections: string[];
}

const briefSchema = z.object({
  historyRecap: z.string().min(1),
  recentSignals: z.array(z.string().min(1)),
  suggestedQuestions: z.array(z.string().min(1)),
  likelyObjections: z.array(z.string().min(1)),
});

export interface PrepLeadInput {
  firstName: string;
  lastName: string;
  company: string;
  title: string | null;
  currentStage: string | null;
  conversationStage: string | null;
}

export interface PrepProjectInput {
  name: string;
  idea: string | null;
  approach: string | null;
}

export interface PrepReminderInput {
  title: string;
  notes: string | null;
  dueDate: Date | string;
}

export interface PrepTouchpoint {
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  notes: string | null;
  occurredAt: Date | string;
}

export interface PrepWikiSource {
  title: string;
  excerpt: string;
}

export interface PrepWebSource {
  title: string;
  url: string;
  snippet: string;
}

export interface PrepInput {
  lead: PrepLeadInput;
  project: PrepProjectInput;
  reminder: PrepReminderInput;
  touchpoints: PrepTouchpoint[];
  wikiDocs: PrepWikiSource[];
  webResults: PrepWebSource[];
}

function formatDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export async function runMeetingPrep(
  input: PrepInput,
  llm?: LLMCaller,
): Promise<MeetingPrepBrief> {
  const systemPrompt = `You are a sales meeting prep assistant. Given a lead's history, wiki context, and recent web signals, produce a concise prep brief.

Return JSON only with this exact shape:
{
  "historyRecap": "2-4 sentence recap of the relationship so far",
  "recentSignals": ["signal grounded in the provided sources"],
  "suggestedQuestions": ["high-leverage question to ask"],
  "likelyObjections": ["objection the prospect may raise"]
}

Rules:
- Ground every "recentSignals" item in either a touchpoint, wiki source, or web result. Do not invent.
- "historyRecap" must reference real interactions from the touchpoint list. If there are no touchpoints, say so.
- Keep arrays focused (3-6 items each). Empty arrays are allowed when there is genuinely nothing to say.
- No URLs in the output text. The UI shows sources separately.`;

  const touchpointSection = input.touchpoints.length
    ? input.touchpoints
        .map(
          (t, i) =>
            `${i + 1}. [${formatDate(t.occurredAt)}] ${t.direction} ${t.channel}${
              t.subject ? ` — ${t.subject}` : ''
            }\n   ${t.body ?? t.notes ?? '(no body)'}`,
        )
        .join('\n')
    : '(no touchpoints logged yet)';

  const wikiSection = input.wikiDocs.length
    ? input.wikiDocs.map((d, i) => `${i + 1}. ${d.title}\n   ${d.excerpt}`).join('\n')
    : '(no wiki context)';

  const webSection = input.webResults.length
    ? input.webResults
        .map((w, i) => `${i + 1}. ${w.title}\n   ${w.snippet}`)
        .join('\n')
    : '(no fresh web results)';

  const userPrompt = `Project: ${input.project.name}
Project idea: ${input.project.idea ?? 'n/a'}
Project approach: ${input.project.approach ?? 'n/a'}

Lead: ${input.lead.firstName} ${input.lead.lastName} — ${input.lead.title ?? 'unknown title'} at ${input.lead.company}
Pipeline stage: ${input.lead.currentStage ?? 'n/a'}
Conversation stage: ${input.lead.conversationStage ?? 'n/a'}

Upcoming meeting: ${input.reminder.title} (due ${formatDate(input.reminder.dueDate)})
${input.reminder.notes ? `Reminder notes: ${input.reminder.notes}` : ''}

Recent touchpoints (most recent last):
${touchpointSection}

Wiki context:
${wikiSection}

Recent web signals on ${input.lead.company}:
${webSection}`;

  return runAgent({
    name: 'meeting-prep',
    systemPrompt,
    userPrompt,
    schema: briefSchema,
    maxTokens: 1536,
    llm,
  });
}

export function parseMeetingPrep(
  raw: unknown,
):
  | { ok: true; value: MeetingPrepBrief }
  | { ok: false; error: string } {
  const result = briefSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: issues };
  }
  return { ok: true, value: result.data };
}
