import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateLLMResponseWithTools } from '@/lib/llm-agent';
import { buildLeadExpertSystemPrompt } from '@/lib/lead-expert';

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
    const { message, projectIds, conversationId } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const selectedProjectIds: string[] = projectIds || [];

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const conv = await prisma.assistantConversation.create({
        data: { title: message.slice(0, 80) },
      });
      convId = conv.id;
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

    const systemPrompt = await buildLeadExpertSystemPrompt(selectedProjectIds);

    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const response = await generateLLMResponseWithTools(llmMessages);

    // Save assistant response
    await prisma.assistantMessage.create({
      data: {
        conversationId: convId,
        role: 'assistant',
        content: response,
        projectIds: selectedProjectIds,
      },
    });

    return NextResponse.json({
      conversationId: convId,
      response,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to generate response';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
