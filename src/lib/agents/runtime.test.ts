import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentRuntimeError,
  extractJson,
  parseAgentJson,
  runAgent,
  type LLMCaller,
} from './runtime';

const candidateSchema = z.object({
  company: z.string(),
  rationale: z.string(),
});

describe('extractJson', () => {
  it('returns bare object unchanged', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it('strips bare ``` fences', () => {
    const raw = '```\n{"a":1}\n```';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it('extracts object from prose-wrapped output', () => {
    const raw = 'Sure, here is the JSON:\n{"a":1}\nLet me know if you need more.';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it('extracts top-level array', () => {
    const raw = 'Result: [1, 2, 3] done';
    expect(extractJson(raw)).toBe('[1, 2, 3]');
  });

  it('returns trimmed input when no braces found', () => {
    expect(extractJson('  no json here  ')).toBe('no json here');
  });
});

describe('parseAgentJson', () => {
  it('returns ok on valid input', () => {
    const result = parseAgentJson(
      '{"company":"Acme","rationale":"matches ICP"}',
      candidateSchema,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.company).toBe('Acme');
    }
  });

  it('returns error on missing field', () => {
    const result = parseAgentJson('{"company":"Acme"}', candidateSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/rationale/);
    }
  });

  it('returns error on wrong type', () => {
    const result = parseAgentJson(
      '{"company":123,"rationale":"x"}',
      candidateSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/company/);
    }
  });

  it('returns error on invalid JSON', () => {
    const result = parseAgentJson('not json at all', candidateSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JSON\.parse failed/);
    }
  });
});

describe('runAgent', () => {
  it('returns parsed value on first success', async () => {
    const calls: number[] = [];
    const llm: LLMCaller = async () => {
      calls.push(1);
      return '{"company":"Acme","rationale":"good"}';
    };

    const result = await runAgent({
      name: 'test',
      systemPrompt: 's',
      userPrompt: 'u',
      schema: candidateSchema,
      llm,
    });

    expect(result.company).toBe('Acme');
    expect(calls.length).toBe(1);
  });

  it('retries once on parse failure and succeeds', async () => {
    let n = 0;
    const llm: LLMCaller = async () => {
      n++;
      if (n === 1) return 'not json';
      return '{"company":"Acme","rationale":"good"}';
    };

    const result = await runAgent({
      name: 'test',
      systemPrompt: 's',
      userPrompt: 'u',
      schema: candidateSchema,
      llm,
    });

    expect(result.company).toBe('Acme');
    expect(n).toBe(2);
  });

  it('includes the parse error in the retry prompt', async () => {
    const seen: string[] = [];
    let n = 0;
    const llm: LLMCaller = async (messages) => {
      n++;
      const last = messages[messages.length - 1].content;
      seen.push(last);
      if (n === 1) return '{"company":"Acme"}';
      return '{"company":"Acme","rationale":"ok"}';
    };

    await runAgent({
      name: 'test',
      systemPrompt: 's',
      userPrompt: 'u',
      schema: candidateSchema,
      llm,
    });

    expect(seen[1]).toMatch(/rationale/);
  });

  it('throws AgentRuntimeError after second failure', async () => {
    const llm: LLMCaller = async () => 'still not json';

    await expect(
      runAgent({
        name: 'test',
        systemPrompt: 's',
        userPrompt: 'u',
        schema: candidateSchema,
        llm,
      }),
    ).rejects.toBeInstanceOf(AgentRuntimeError);
  });

  it('passes maxTokens through to the llm caller', async () => {
    const seen: number[] = [];
    const llm: LLMCaller = async (_msgs, max) => {
      seen.push(max);
      return '{"company":"Acme","rationale":"ok"}';
    };

    await runAgent({
      name: 'test',
      systemPrompt: 's',
      userPrompt: 'u',
      schema: candidateSchema,
      maxTokens: 2048,
      llm,
    });

    expect(seen[0]).toBe(2048);
  });
});
