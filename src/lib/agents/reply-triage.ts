import { z } from 'zod';
import { runAgent, type LLMCaller } from './runtime';

export const TRIAGE_INTENTS = [
  'interested',
  'objection',
  'schedule_meeting',
  'unsubscribe',
  'other',
] as const;

export type TriageIntent = (typeof TRIAGE_INTENTS)[number];

export interface TriageResult {
  intent: TriageIntent;
  confidence: number;
  summary: string;
  suggestedAction: string;
  draftReply?: string;
}

const triageSchema = z.object({
  intent: z.enum(TRIAGE_INTENTS),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  suggestedAction: z.string().min(1),
  draftReply: z.string().optional(),
});

export interface TouchpointInput {
  channel: string;
  subject: string | null;
  body: string | null;
  notes: string | null;
}

export interface LeadInput {
  firstName: string;
  lastName: string;
  company: string;
  title: string | null;
}

export interface ProjectInput {
  name: string;
  idea: string | null;
  approach: string | null;
}

export async function triageReply(
  touchpoint: TouchpointInput,
  lead: LeadInput,
  project: ProjectInput,
  llm?: LLMCaller,
): Promise<TriageResult> {
  const systemPrompt = `You triage inbound replies from sales prospects. Classify the reply into one of these intents:
- interested: shows positive interest, wants to learn more
- objection: pushback, concern, or hesitation that needs handling
- schedule_meeting: explicit request or willingness to book a call
- unsubscribe: opt-out, do not contact, remove from list, hostile
- other: anything else

Return JSON only:
{"intent":"...","confidence":0.0-1.0,"summary":"one line","suggestedAction":"what the rep should do next","draftReply":"optional reply draft"}

Rules:
- Omit "draftReply" entirely when intent is "unsubscribe".
- "confidence" is your confidence in the classification, 0-1.
- "summary" is one short sentence describing the reply.
- "draftReply" should be a short, human-sounding reply ready to send.`;

  const userPrompt = `Project: ${project.name}
Project idea: ${project.idea ?? 'n/a'}
Project approach: ${project.approach ?? 'n/a'}

Lead: ${lead.firstName} ${lead.lastName} — ${lead.title ?? 'unknown title'} at ${lead.company}

Inbound reply (${touchpoint.channel}):
Subject: ${touchpoint.subject ?? '(no subject)'}
${touchpoint.body ?? '(no body)'}
${touchpoint.notes ? `\nNotes: ${touchpoint.notes}` : ''}`;

  const raw = await runAgent({
    name: 'reply-triage',
    systemPrompt,
    userPrompt,
    schema: triageSchema,
    maxTokens: 768,
    llm,
  });

  return normalizeTriage(raw);
}

export function parseTriageOutput(
  raw: unknown,
):
  | { ok: true; value: TriageResult }
  | { ok: false; error: string } {
  const result = triageSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: issues };
  }
  return { ok: true, value: normalizeTriage(result.data) };
}

function normalizeTriage(value: TriageResult): TriageResult {
  if (value.intent === 'unsubscribe') {
    const { draftReply: _omit, ...rest } = value;
    void _omit;
    return rest;
  }
  return value;
}
