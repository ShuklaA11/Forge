export interface OgResult {
  title?: string;
  description?: string;
  ogImage?: string;
  fetchedExcerpt?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const EXCERPT_MAX_CHARS = 2_000;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractMeta(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta\\s+[^>]*?(?:property|name)\\s*=\\s*["']${key}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta\\s+[^>]*?content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${key}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

function extractTitleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  return decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || undefined;
}

function extractExcerpt(html: string): string | undefined {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(stripped).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > EXCERPT_MAX_CHARS ? text.slice(0, EXCERPT_MAX_CHARS) : text;
}

export function parseOg(html: string): OgResult {
  const ogTitle = extractMeta(html, 'og:title');
  const ogDescription = extractMeta(html, 'og:description');
  const ogImage = extractMeta(html, 'og:image');
  const fallbackTitle = extractTitleTag(html);
  const fallbackDescription = extractMeta(html, 'description');

  const result: OgResult = {};
  const title = ogTitle || fallbackTitle;
  const description = ogDescription || fallbackDescription;
  if (title) result.title = title;
  if (description) result.description = description;
  if (ogImage) result.ogImage = ogImage;

  const excerpt = extractExcerpt(html);
  if (excerpt) result.fetchedExcerpt = excerpt;

  return result;
}

export async function fetchOg(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<OgResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'LeadFlow-OgFetch/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok || !res.body) return {};
    const contentType = res.headers.get('content-type') || '';
    if (contentType && !contentType.includes('html')) return {};

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let html = '';
    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (bytesRead >= maxBytes) {
        try {
          await reader.cancel();
        } catch {}
        break;
      }
    }
    html += decoder.decode();
    return parseOg(html);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}
