import { describe, it, expect } from 'vitest';
import { parseOg } from './og-fetch';

describe('parseOg', () => {
  it('extracts og:title, og:description, og:image', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Hello World">
        <meta property="og:description" content="A friendly page">
        <meta property="og:image" content="https://example.com/img.png">
      </head><body>Body text.</body></html>
    `;
    const result = parseOg(html);
    expect(result.title).toBe('Hello World');
    expect(result.description).toBe('A friendly page');
    expect(result.ogImage).toBe('https://example.com/img.png');
  });

  it('falls back to <title> when og:title missing', () => {
    const html = `<html><head><title>Fallback Title</title></head><body>x</body></html>`;
    const result = parseOg(html);
    expect(result.title).toBe('Fallback Title');
  });

  it('falls back to meta name="description" when og:description missing', () => {
    const html = `
      <html><head>
        <meta name="description" content="Plain meta description">
      </head><body>x</body></html>
    `;
    const result = parseOg(html);
    expect(result.description).toBe('Plain meta description');
  });

  it('prefers og:title over <title>', () => {
    const html = `
      <html><head>
        <title>Doc Title</title>
        <meta property="og:title" content="OG Title">
      </head><body>x</body></html>
    `;
    expect(parseOg(html).title).toBe('OG Title');
  });

  it('handles content attribute before property attribute', () => {
    const html = `<meta content="Reverse Order" property="og:title">`;
    expect(parseOg(html).title).toBe('Reverse Order');
  });

  it('decodes HTML entities', () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry &#39;forever&#39;">`;
    expect(parseOg(html).title).toBe("Tom & Jerry 'forever'");
  });

  it('extracts excerpt from body text', () => {
    const html = `
      <html><head><title>x</title></head>
      <body><p>First sentence.</p><p>Second sentence.</p></body></html>
    `;
    const result = parseOg(html);
    expect(result.fetchedExcerpt).toContain('First sentence');
    expect(result.fetchedExcerpt).toContain('Second sentence');
  });

  it('strips script and style content from excerpt', () => {
    const html = `
      <html><head><title>x</title></head>
      <body>
        <script>const x = 'should not appear';</script>
        <style>.foo { color: red; }</style>
        <p>Real content here.</p>
      </body></html>
    `;
    const result = parseOg(html);
    expect(result.fetchedExcerpt).toContain('Real content here');
    expect(result.fetchedExcerpt).not.toContain('should not appear');
    expect(result.fetchedExcerpt).not.toContain('color: red');
  });

  it('returns empty object when html has no metadata or body', () => {
    expect(parseOg('')).toEqual({});
  });

  it('caps excerpt at 2000 chars', () => {
    const big = 'word '.repeat(1000);
    const html = `<html><body><p>${big}</p></body></html>`;
    const result = parseOg(html);
    expect(result.fetchedExcerpt?.length).toBeLessThanOrEqual(2000);
  });

  it('treats name="og:title" as og:title (some sites use name=)', () => {
    const html = `<meta name="og:title" content="Name-attr OG">`;
    expect(parseOg(html).title).toBe('Name-attr OG');
  });
});
