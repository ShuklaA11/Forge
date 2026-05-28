import { prisma } from './db';
import { generateLLMResponse } from './llm';
import { ASSISTANT_TOOLS, findTool } from './assistant-tools';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolCallRecord {
  name: string;
  args: unknown;
  result: { ok: true; summary: string } | { ok: false; error: string };
}

export interface ToolLoopResult {
  text: string;
  toolCalls: ToolCallRecord[];
}

const MAX_ITERATIONS = 5;
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
}

async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (!settings) settings = await prisma.settings.create({ data: { id: 'default' } });
  return settings;
}

export async function runAssistantWithTools(
  messages: LLMMessage[],
  projectId: string | null,
  options: { maxTokens?: number } = {},
): Promise<ToolLoopResult> {
  const settings = await getSettings();
  const { maxTokens = 2048 } = options;

  // Only Anthropic supports tool-use in this codebase. Other providers fall through.
  if (settings.llmProvider !== 'anthropic' || !settings.llmApiKey || !projectId) {
    const text = await generateLLMResponse(messages, maxTokens);
    return { text, toolCalls: [] };
  }

  const systemContent = messages.find((m) => m.role === 'system')?.content || '';
  const conversation: Array<
    | { role: 'user'; content: string | AnthropicContentBlock[] | Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> }
    | { role: 'assistant'; content: AnthropicContentBlock[] | string }
  > = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const toolCalls: ToolCallRecord[] = [];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.llmApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: systemContent,
        tools: ASSISTANT_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
        messages: conversation,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data: AnthropicResponse = await response.json();

    if (data.stop_reason !== 'tool_use') {
      const textBlocks = data.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
      const text = textBlocks.map((b) => b.text).join('\n').trim();
      return { text: text || '(no response)', toolCalls };
    }

    // Append assistant turn (with tool_use blocks) to conversation
    conversation.push({ role: 'assistant', content: data.content });

    // Execute each tool_use block, collect tool_result blocks for the next turn
    const toolUseBlocks = data.content.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use',
    );
    const toolResults: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    for (const block of toolUseBlocks) {
      const tool = findTool(block.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });
        toolCalls.push({
          name: block.name,
          args: block.input,
          result: { ok: false, error: `Unknown tool: ${block.name}` },
        });
        continue;
      }
      try {
        const result = await tool.handler(projectId, block.input);
        toolCalls.push({
          name: block.name,
          args: block.input,
          result: result.ok ? { ok: true, summary: result.summary } : { ok: false, error: result.error },
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.ok ? result.summary : `Error: ${result.error}`,
          is_error: !result.ok,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tool execution failed';
        toolCalls.push({
          name: block.name,
          args: block.input,
          result: { ok: false, error: message },
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${message}`,
          is_error: true,
        });
      }
    }

    conversation.push({ role: 'user', content: toolResults });
  }

  return {
    text: '(tool-use loop exceeded max iterations)',
    toolCalls,
  };
}
