import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? '••••••••' : '';
  return key.slice(0, 5) + '••••••••' + key.slice(-4);
}

export async function GET() {
  let settings = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: 'default' } });
  }
  return NextResponse.json({
    ...settings,
    llmApiKey: maskKey(settings.llmApiKey),
    openaiApiKey: maskKey(settings.openaiApiKey),
  });
}

export async function PUT(request: Request) {
  const body = await request.json();

  // Only update keys if user provided a new value (not the masked placeholder)
  const isMasked = (val: string) => val.includes('••••••••');

  const updateData: Record<string, unknown> = {
    llmProvider: body.llmProvider,
    webSearchEnabled: body.webSearchEnabled ?? false,
    defaultMaxTouchpoints: body.defaultMaxTouchpoints,
    defaultIntervalDays: body.defaultIntervalDays,
  };

  if (body.llmApiKey && !isMasked(body.llmApiKey)) {
    updateData.llmApiKey = body.llmApiKey;
  }
  if (body.openaiApiKey && !isMasked(body.openaiApiKey)) {
    updateData.openaiApiKey = body.openaiApiKey;
  }

  const settings = await prisma.settings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      ...updateData,
      llmApiKey: (updateData.llmApiKey as string) || '',
      openaiApiKey: (updateData.openaiApiKey as string) || '',
    } as Parameters<typeof prisma.settings.upsert>[0]['create'],
    update: updateData,
  });

  return NextResponse.json({
    ...settings,
    llmApiKey: maskKey(settings.llmApiKey),
    openaiApiKey: maskKey(settings.openaiApiKey),
  });
}
