import { ChatOllama } from '@langchain/ollama';
import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { prisma } from './db';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AgentOptions {
  enableWebSearch?: boolean;
  maxIterations?: number;
}

async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: 'default' } });
  }
  return settings;
}

export async function generateLLMResponseWithTools(
  messages: LLMMessage[],
  options: AgentOptions = {}
): Promise<string> {
  const settings = await getSettings();
  const { enableWebSearch = true, maxIterations = 3 } = options;

  // Fall back to plain LLM if web search is disabled or provider isn't Ollama
  if (!settings.webSearchEnabled || !enableWebSearch || settings.llmProvider !== 'ollama') {
    const { generateLLMResponse } = await import('./llm');
    return generateLLMResponse(messages);
  }

  const model = new ChatOllama({
    baseUrl: 'http://localhost:11434',
    model: 'qwen3.5:4b',
    temperature: 0.7,
  });

  const tools = [new DuckDuckGoSearch({ maxResults: 3 })];

  // Build system prompt with search instructions
  const systemContent = messages.find((m) => m.role === 'system')?.content || '';
  const augmentedSystem =
    systemContent +
    '\n\nYou have access to a web search tool. Use it when you need current information about a company, person, industry trend, or any factual data that would improve your response. Do not search unless it would add concrete value.';

  // Create the ReAct agent via LangGraph
  const agent = createReactAgent({
    llm: model,
    tools,
    stateModifier: augmentedSystem,
  });

  // Convert messages to LangChain format
  const langchainMessages: BaseMessage[] = [];
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  for (const msg of nonSystemMessages) {
    if (msg.role === 'user') {
      langchainMessages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      langchainMessages.push(new AIMessage(msg.content));
    }
  }

  const result = await agent.invoke(
    { messages: langchainMessages },
    { recursionLimit: maxIterations * 2 + 1 }
  );

  // Extract the last AI message from the result
  const aiMessages = result.messages.filter(
    (m: BaseMessage) => m._getType() === 'ai' && typeof m.content === 'string' && m.content.length > 0
  );
  const lastAiMessage = aiMessages[aiMessages.length - 1];
  return (lastAiMessage?.content as string) || 'No response generated.';
}
