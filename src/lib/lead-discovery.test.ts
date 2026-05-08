import { describe, expect, it } from 'vitest';
import { parseCandidates } from './lead-discovery';

describe('parseCandidates', () => {
  it('returns valid candidates unchanged', () => {
    const raw = {
      candidates: [
        {
          company: 'Acme',
          firstName: 'Jane',
          lastName: 'Doe',
          title: 'CFO',
          sourceUrls: ['https://example.com/jane'],
          rationale: 'Matches ICP',
        },
      ],
    };
    const out = parseCandidates(raw);
    expect(out).toHaveLength(1);
    expect(out[0].company).toBe('Acme');
    expect(out[0].sourceUrls).toEqual(['https://example.com/jane']);
  });

  it('drops candidates with empty sourceUrls', () => {
    const raw = {
      candidates: [
        {
          company: 'Acme',
          sourceUrls: [],
          rationale: 'Matches ICP',
        },
        {
          company: 'Beta',
          sourceUrls: ['https://example.com/beta'],
          rationale: 'Also matches',
        },
      ],
    };
    const out = parseCandidates(raw);
    expect(out).toHaveLength(1);
    expect(out[0].company).toBe('Beta');
  });

  it('drops candidates whose sourceUrls field is missing entirely', () => {
    const raw = {
      candidates: [
        {
          company: 'Acme',
          rationale: 'Matches ICP',
        },
      ],
    };
    const out = parseCandidates(raw);
    expect(out).toHaveLength(0);
  });

  it('returns empty array on invalid envelope', () => {
    expect(parseCandidates({ wrong: 'shape' })).toEqual([]);
    expect(parseCandidates(null)).toEqual([]);
    expect(parseCandidates('not an object')).toEqual([]);
  });

  it('returns empty array on invalid candidate fields', () => {
    const raw = {
      candidates: [
        {
          company: 123,
          sourceUrls: ['https://example.com'],
          rationale: 'x',
        },
      ],
    };
    expect(parseCandidates(raw)).toEqual([]);
  });

  it('strips URLs not in the validUrls allowlist when provided', () => {
    const raw = {
      candidates: [
        {
          company: 'Acme',
          sourceUrls: ['https://known.com/a', 'https://hallucinated.com/b'],
          rationale: 'Matches ICP',
        },
      ],
    };
    const out = parseCandidates(raw, new Set(['https://known.com/a']));
    expect(out).toHaveLength(1);
    expect(out[0].sourceUrls).toEqual(['https://known.com/a']);
  });

  it('drops candidate when all source URLs are hallucinated', () => {
    const raw = {
      candidates: [
        {
          company: 'Acme',
          sourceUrls: ['https://hallucinated.com/a'],
          rationale: 'Matches ICP',
        },
      ],
    };
    const out = parseCandidates(raw, new Set(['https://known.com/a']));
    expect(out).toHaveLength(0);
  });

  it('ignores extra unknown fields on candidates', () => {
    const raw = {
      candidates: [
        {
          company: 'Acme',
          sourceUrls: ['https://example.com/a'],
          rationale: 'x',
          extraGarbage: 'ignored',
        },
      ],
    };
    const out = parseCandidates(raw);
    expect(out).toHaveLength(1);
  });
});
