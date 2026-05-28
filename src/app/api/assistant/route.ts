import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateLLMResponseWithTools } from '@/lib/llm-agent';
import { runAssistantWithTools } from '@/lib/llm-tool-loop';
import { buildLeadExpertSystemPrompt } from '@/lib/lead-expert';
import { ASSISTANT_PERSONAS_ORDERED, type AssistantPersona } from '@/types';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (conversationId) {
    const conversation = await prisma.assistantConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json(conversation);
  }

  const conversations = await prisma.assistantConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });
  return NextResponse.json(conversations);
}

export async function POST(request: Request) {
  try {
    const { message, projectIds, conversationId, persona } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const selectedProjectIds: string[] = projectIds || [];
    const requestedPersona: AssistantPersona = persona && (ASSISTANT_PERSONAS_ORDERED as readonly string[]).includes(persona)
      ? (persona as AssistantPersona)
      : 'LEAD_EXPERT';

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const conv = await prisma.assistantConversation.create({
        data: { title: message.slice(0, 80), persona: requestedPersona },
      });
      convId = conv.id;
    } else if (persona) {
      // If persona was explicitly sent, update the conversation row to match
      await prisma.assistantConversation.update({
        where: { id: convId },
        data: { persona: requestedPersona },
      });
    }

    // Save user message
    await prisma.assistantMessage.create({
      data: {
        conversationId: convId,
        role: 'user',
        content: message,
        projectIds: selectedProjectIds,
      },
    });

    // Build conversation history for LLM
    const history = await prisma.assistantMessage.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'asc' },
    });

    const { prompt: systemPrompt, sources } = await buildLeadExpertSystemPrompt(
      selectedProjectIds,
      message,
      requestedPersona,
    );

    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // If exactly one project is in scope, route through the tool-use loop so the
    // assistant can write notes/tasks/etc. Otherwise stick with the existing path.
    let response: string;
    let toolCalls: Array<{ name: string; args: unknown; result: { ok: boolean; summary?: string; error?: string } }> = [];
    if (selectedProjectIds.length === 1) {
      const result = await runAssistantWithTools(llmMessages, selectedProjectIds[0]);
      response = result.text;
      toolCalls = result.toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
        result: tc.result,
      }));
    } else {
      response = await generateLLMResponseWithTools(llmMessages);
    }

    // Save assistant response with grounding sources + tool calls
    await prisma.assistantMessage.create({
      data: {
        conversationId: convId,
        role: 'assistant',
        content: response,
        projectIds: selectedProjectIds,
        sources: sources.length > 0 ? JSON.parse(JSON.stringify(sources)) : undefined,
        toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
      },
    });

    return NextResponse.json({
      conversationId: convId,
      response,
      sources,
      toolCalls,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to generate response';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
