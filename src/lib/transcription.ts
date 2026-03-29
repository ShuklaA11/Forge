import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from './db';

async function getOpenAIKey(): Promise<string> {
  let settings = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: 'default' } });
  }

  // Use dedicated openaiApiKey, or fall back to llmApiKey if provider is openai
  const key = settings.openaiApiKey || (settings.llmProvider === 'openai' ? settings.llmApiKey : '');

  if (!key) {
    throw new Error('OpenAI API key not configured. Go to Settings to add your OpenAI API key for Whisper transcription.');
  }

  return key;
}

const MIME_TYPES: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

export async function transcribeAudio(filePath: string): Promise<string> {
  const apiKey = await getOpenAIKey();

  const fileBuffer = await readFile(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream';

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${error}`);
  }

  const data = await response.json() as { text: string };
  if (!data.text) {
    throw new Error('Whisper returned an empty transcript. The audio may be silent or unrecognizable.');
  }
  return data.text.trim();
}
