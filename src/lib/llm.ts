import { prisma } from './db';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: 'default' } });
  }
  return settings;
}

export async function generateLLMResponse(messages: LLMMessage[], maxTokens: number = 1024): Promise<string> {
  const settings = await getSettings();

  if (settings.llmProvider !== 'ollama' && !settings.llmApiKey) {
    throw new Error('LLM API key not configured. Go to Settings to add your API key.');
  }

  if (settings.llmProvider === 'ollama') {
    // Use native Ollama API (/api/chat) so that think: false is properly respected.
    // The OpenAI-compatible endpoint ignores think: false for Qwen3 and returns
    // the reasoning in reasoning_content with an empty content field.
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.5:4b',
        messages,
        think: false,
        stream: false,
        options: { num_predict: maxTokens },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${error}. Make sure Ollama is running (ollama serve).`);
    }

    const data = await response.json();
    return data.message.content;
  } else if (settings.llmProvider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.llmApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: messages.find(m => m.role === 'system')?.content || '',
        messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } else if (settings.llmProvider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.llmApiKey}`,
      },
      body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: maxTokens }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  throw new Error(`Unsupported LLM provider: ${settings.llmProvider}`);
}
