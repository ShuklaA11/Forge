import { z } from 'zod';
import { runAgent, type LLMCaller } from './runtime';

export interface UnaddressedObjection {
  objection: string;
  suggestedResponse: string;
}

export interface Commitment {
  description: string;
  suggestedDueDate?: string;
}

export interface CoachReview {
  missedQuestions: string[];
  unaddressedObjections: UnaddressedObjection[];
  commitments: Commitment[];
}

const coachSchema = z.object({
  missedQuestions: z.array(z.string().min(1)),
  unaddressedObjections: z.array(
    z.object({
      objection: z.string().min(1),
      suggestedResponse: z.string().min(1),
    }),
  ),
  commitments: z.array(
    z.object({
      description: z.string().min(1),
      suggestedDueDate: z.string().optional(),
    }),
  ),
});

export interface CoachLeadInput {
  firstName: string;
  lastName: string;
  company: string;
  title: string | null;
  currentStage: string | null;
  conversationStage: string | null;
}

export interface CoachProjectInput {
  name: string;
  idea: string | null;
  approach: string | null;
}

export interface CoachStructuredNotes {
  summary?: string;
  keyPoints?: string[];
  objections?: string[];
  validationSignals?: string[];
  commitments?: string[];
  nextSteps?: string[];
  quotes?: string[];
}

export interface CoachInput {
  transcript: string | null;
  structuredNotes: CoachStructuredNotes | null;
  lead: CoachLeadInput;
  project: CoachProjectInput;
  callDate: Date | string;
}

export async function runCallCoach(
  input: CoachInput,
  llm?: LLMCaller,
): Promise<CoachReview> {
  const systemPrompt = `You are a sales call coach. Given a call transcript and structured notes, identify gaps the rep should follow up on.

Return JSON only with this exact shape:
{
  "missedQuestions": ["question the rep should have asked but didn't"],
  "unaddressedObjections": [{"objection":"the prospect's concern","suggestedResponse":"how to handle it next time"}],
  "commitments": [{"description":"what the rep promised to do","suggestedDueDate":"YYYY-MM-DD optional"}]
}

Rules:
- Only include items that are concretely supported by the transcript or notes. Do not invent.
- Keep "missedQuestions" to high-leverage discovery questions that were skipped (budget, authority, timeline, technical fit).
- "commitments" are things the rep agreed to deliver to the prospect. If a date wasn't stated, omit suggestedDueDate.
- If a category has nothing, return an empty array — never null, never omit the key.`;

  const notes = input.structuredNotes ?? {};
  const callDateIso =
    input.callDate instanceof Date
      ? input.callDate.toISOString().slice(0, 10)
      : input.callDate;

  const userPrompt = `Project: ${input.project.name}
Project idea: ${input.project.idea ?? 'n/a'}
Project approach: ${input.project.approach ?? 'n/a'}

Lead: ${input.lead.firstName} ${input.lead.lastName} — ${input.lead.title ?? 'unknown title'} at ${input.lead.company}
Pipeline stage: ${input.lead.currentStage ?? 'n/a'}
Conversation stage: ${input.lead.conversationStage ?? 'n/a'}
Call date: ${callDateIso}

Structured notes:
Summary: ${notes.summary ?? '(none)'}
Key points: ${(notes.keyPoints ?? []).join(' | ') || '(none)'}
Objections raised: ${(notes.objections ?? []).join(' | ') || '(none)'}
Validation signals: ${(notes.validationSignals ?? []).join(' | ') || '(none)'}
Commitments noted: ${(notes.commitments ?? []).join(' | ') || '(none)'}
Next steps noted: ${(notes.nextSteps ?? []).join(' | ') || '(none)'}

Transcript:
${input.transcript ?? '(no transcript — rely on structured notes)'}`;

  return runAgent({
    name: 'call-coach',
    systemPrompt,
    userPrompt,
    schema: coachSchema,
    maxTokens: 1024,
    llm,
  });
}

export function parseCoachReview(
  raw: unknown,
):
  | { ok: true; value: CoachReview }
  | { ok: false; error: string } {
  const result = coachSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: issues };
  }
  return { ok: true, value: result.data };
}
