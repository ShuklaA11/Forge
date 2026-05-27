import { describe, it, expect } from 'vitest';
import type { Resource } from '@prisma/client';
import { scoreResource, formatResourcesForPrompt } from './retrieve';

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'r1',
    projectId: 'p1',
    url: 'https://example.com',
    title: null,
    description: null,
    ogImage: null,
    fetchedExcerpt: null,
    userNote: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('scoreResource', () => {
  it('returns 0 for empty query tokens', () => {
    const r = makeResource({ title: 'Anything' });
    expect(scoreResource(r, [])).toBe(0);
  });

  it('weights userNote highest', () => {
    const r = makeResource({
      title: 'unrelated',
      userNote: 'pricing strategy notes',
    });
    expect(scoreResource(r, ['pricing'])).toBeGreaterThanOrEqual(4);
  });

  it('weights title above description', () => {
    const inTitle = makeResource({ title: 'pricing guide' });
    const inDescription = makeResource({ description: 'pricing guide' });
    expect(scoreResource(inTitle, ['pricing'])).toBeGreaterThan(
      scoreResource(inDescription, ['pricing']),
    );
  });

  it('matches against tags', () => {
    const r = makeResource({ tags: ['pricing', 'b2b'] });
    expect(scoreResource(r, ['pricing'])).toBeGreaterThan(0);
  });

  it('ignores resources with no matches', () => {
    const r = makeResource({ title: 'unrelated', description: 'also unrelated' });
    expect(scoreResource(r, ['pricing'])).toBe(0);
  });
});

describe('formatResourcesForPrompt', () => {
  it('returns placeholder when no resources retrieved', () => {
    expect(formatResourcesForPrompt([])).toBe('_No relevant resources saved._');
  });

  it('renders title, url, score, and userNote', () => {
    const r = makeResource({
      title: 'Saved Article',
      url: 'https://example.com/a',
      userNote: 'Why I saved this',
    });
    const out = formatResourcesForPrompt([{ resource: r, score: 7 }]);
    expect(out).toContain('[Resource] Saved Article');
    expect(out).toContain('https://example.com/a');
    expect(out).toContain('score: 7');
    expect(out).toContain('Why I saved this');
  });

  it('falls back to url for title when title is missing', () => {
    const r = makeResource({ url: 'https://only-url.test/' });
    const out = formatResourcesForPrompt([{ resource: r, score: 1 }]);
    expect(out).toContain('[Resource] https://only-url.test/');
  });

  it('truncates long excerpts', () => {
    const r = makeResource({ fetchedExcerpt: 'x'.repeat(2000) });
    const out = formatResourcesForPrompt([{ resource: r, score: 1 }], 200);
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(500);
  });
});
