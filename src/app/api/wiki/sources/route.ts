import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchUrl, extractPdf, ingestNote, ingestArticle } from '@/lib/wiki/ingest';
import type { WikiRawSourceKind, Prisma } from '@prisma/client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    );
  }

  const sources = await prisma.wikiRawSource.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(sources);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, kind, url, filePath, content, title, metadata } = body as {
      projectId: string;
      kind: WikiRawSourceKind;
      url?: string;
      filePath?: string;
      content?: string;
      title?: string;
      metadata?: Record<string, unknown>;
    };

    if (!projectId || !kind) {
      return NextResponse.json(
        { error: 'projectId and kind are required' },
        { status: 400 }
      );
    }

    let extracted;

    switch (kind) {
      case 'URL': {
        if (!url) {
          return NextResponse.json(
            { error: 'url is required for URL sources' },
            { status: 400 }
          );
        }
        extracted = await fetchUrl(url);
        break;
      }
      case 'PDF': {
        if (!filePath) {
          return NextResponse.json(
            { error: 'filePath is required for PDF sources' },
            { status: 400 }
          );
        }
        extracted = await extractPdf(filePath);
        break;
      }
      case 'ARTICLE': {
        if (!content) {
          return NextResponse.json(
            { error: 'content is required for ARTICLE sources' },
            { status: 400 }
          );
        }
        extracted = ingestArticle(content, title);
        break;
      }
      case 'NOTE': {
        if (!content) {
          return NextResponse.json(
            { error: 'content is required for NOTE sources' },
            { status: 400 }
          );
        }
        extracted = ingestNote(content, title);
        break;
      }
      case 'IMAGE': {
        extracted = {
          title: title || 'Image',
          content: '',
          metadata: { filePath },
        };
        break;
      }
      default:
        return NextResponse.json(
          { error: `Unsupported source kind: ${kind}` },
          { status: 400 }
        );
    }

    const source = await prisma.wikiRawSource.create({
      data: {
        projectId,
        kind,
        title: title || extracted.title,
        url: url || null,
        filePath: filePath || null,
        content: extracted.content,
        metadata: {
          ...(extracted.metadata ?? {}),
          ...(metadata ?? {}),
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    console.error('Error creating wiki source:', error);
    const message = error instanceof Error ? error.message : 'Failed to create wiki source';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
