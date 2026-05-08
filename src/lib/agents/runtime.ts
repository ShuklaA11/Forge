import { z } from 'zod';
import { generateLLMResponse } from '../llm';

export class AgentRuntimeError extends Error {
  constructor(
    message: string,
    readonly agent: string,
    readonly raw?: string,
  ) {
    super(message);
    this.name = 'AgentRuntimeError';
  }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LLMCaller = (messages: LLMMessage[], maxTokens: number) => Promise<string>;

export interface RunAgentOptions<T> {
  name: string;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  llm?: LLMCaller;
}

const DEFAULT_MAX_TOKENS = 1024;

export async function runAgent<T>(opts: RunAgentOptions<T>): Promise<T> {
  const llm = opts.llm ?? generateLLMResponse;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

  const messages: LLMMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.userPrompt },
  ];

  const firstRaw = await llm(messages, maxTokens);
  const firstParse = parseAgentJson(firstRaw, opts.schema);
  if (firstParse.ok) return firstParse.value;

  const retryMessages: LLMMessage[] = [
    ...messages,
    { role: 'assistant', content: firstRaw },
    {
      role: 'user',
      content: `Your previous response was not valid JSON for the required schema. Error: ${firstParse.error}. Return ONLY a JSON object matching the schema. No prose, no code fences.`,
    },
  ];

  const secondRaw = await llm(retryMessages, maxTokens);
  const secondParse = parseAgentJson(secondRaw, opts.schema);
  if (secondParse.ok) return secondParse.value;

  throw new AgentRuntimeError(
    `Agent "${opts.name}" returned invalid JSON after retry: ${secondParse.error}`,
    opts.name,
    secondRaw,
  );
}

export function extractJson(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (fenced) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const candidates = [firstBrace, firstBracket].filter((i) => i >= 0);
  if (candidates.length === 0) return trimmed;
  const start = Math.min(...candidates);
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  const end = trimmed.lastIndexOf(close);
  if (end > start) return trimmed.slice(start, end + 1).trim();

  return trimmed;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseAgentJson<T>(raw: string, schema: z.ZodType<T>): ParseResult<T> {
  const candidate = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'JSON parse failed';
    return { ok: false, error: `JSON.parse failed: ${msg}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Schema validation failed: ${issues}` };
  }
  return { ok: true, value: result.data };
}
