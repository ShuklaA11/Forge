import { generateLLMResponse } from './llm';
import { StructuredNotes } from '@/types';

interface LeadContext {
  firstName: string;
  lastName: string;
  company: string;
  title?: string | null;
  currentStage: string;
  conversationStage: string;
}

export async function generateStructuredNotes(
  content: string,
  leadContext: LeadContext,
  isManualNotes: boolean = false,
): Promise<StructuredNotes> {
  const contentType = isManualNotes ? 'manual notes from a call' : 'a call transcript';

  const systemPrompt = `You are an expert at analyzing sales and business development calls. Given ${contentType} with a lead, extract structured insights.

You MUST respond with ONLY a valid JSON object matching this exact structure (no markdown, no code blocks, no extra text):
{
  "summary": "2-3 sentence overview of the call",
  "keyPoints": ["point 1", "point 2"],
  "quotes": ["notable quote 1"],
  "objections": ["concern or pushback raised"],
  "validationSignals": ["positive signals indicating interest or fit"],
  "commitments": ["who committed to what, by when"],
  "nextSteps": ["agreed follow-up actions"],
  "sentiment": "one of: very_positive, positive, neutral, negative, very_negative",
  "sentimentScore": 0.5
}

Rules:
- sentimentScore is a float from -1.0 (very negative) to 1.0 (very positive)
- All array fields should have at least one entry, or an empty array if nothing applies
- quotes should be verbatim from the transcript when possible${isManualNotes ? ', or paraphrased from notes' : ''}
- Be specific and actionable in nextSteps and commitments
- Focus on business-relevant insights`;

  const userPrompt = `Lead: ${leadContext.firstName} ${leadContext.lastName}
Company: ${leadContext.company}
${leadContext.title ? `Title: ${leadContext.title}` : ''}
Pipeline Stage: ${leadContext.currentStage}
Conversation Stage: ${leadContext.conversationStage}

${isManualNotes ? 'Manual Notes' : 'Transcript'}:
${content}`;

  const response = await generateLLMResponse([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], 2048);

  return parseStructuredNotes(response);
}

function parseStructuredNotes(raw: string): StructuredNotes {
  if (!raw || !raw.trim()) {
    throw new Error('LLM returned an empty response. Check your model and API key in Settings.');
  }

  // Strip <think>...</think> blocks (qwen3 and other reasoning models)
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code blocks if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  }

  if (!cleaned) {
    throw new Error('LLM returned only thinking tokens with no JSON output. Try again or switch models in Settings.');
  }

  let parsed: ReturnType<typeof JSON.parse>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM response was not valid JSON. Raw response: ${cleaned.slice(0, 200)}`);
  }

  // Validate and provide defaults
  return {
    summary: parsed.summary || '',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
    objections: Array.isArray(parsed.objections) ? parsed.objections : [],
    validationSignals: Array.isArray(parsed.validationSignals) ? parsed.validationSignals : [],
    commitments: Array.isArray(parsed.commitments) ? parsed.commitments : [],
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
    sentiment: parsed.sentiment || 'neutral',
    sentimentScore: typeof parsed.sentimentScore === 'number' ? parsed.sentimentScore : 0,
  };
}
