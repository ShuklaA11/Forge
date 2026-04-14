import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

export interface ExtractedContent {
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export async function fetchUrl(url: string): Promise<ExtractedContent> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LeadFlow-WikiBot/1.0' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    // Fallback: convert raw HTML to markdown
    const markdown = turndown.turndown(html);
    return {
      title: dom.window.document.title || url,
      content: markdown,
      metadata: { url, extractionMethod: 'fallback' },
    };
  }

  const markdown = turndown.turndown(article.content ?? '');

  return {
    title: article.title ?? url,
    content: markdown,
    metadata: {
      url,
      byline: article.byline,
      excerpt: article.excerpt,
      siteName: article.siteName,
      extractionMethod: 'readability',
    },
  };
}

export async function extractPdf(filePath: string): Promise<ExtractedContent> {
  const fs = await import('fs/promises');
  const stat = await fs.stat(filePath);

  if (stat.size > MAX_PDF_SIZE) {
    throw new Error(`PDF exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB`);
  }

  const buffer = await fs.readFile(filePath);
  const { pdf } = await import('pdf-parse');
  const data = await pdf(buffer);

  const info = data.info as Record<string, string> | undefined;

  return {
    title: info?.Title || filePath.split('/').pop() || 'Untitled PDF',
    content: data.text,
    metadata: {
      filePath,
      pages: data.total,
      author: info?.Author,
    },
  };
}

export function ingestNote(text: string, title?: string): ExtractedContent {
  return {
    title: title || 'Untitled Note',
    content: text,
  };
}

export function ingestArticle(content: string, title?: string): ExtractedContent {
  return {
    title: title || 'Untitled Article',
    content,
  };
}
