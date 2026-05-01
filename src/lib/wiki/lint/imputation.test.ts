import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StubSearchProvider, type SearchResult } from './search';

vi.mock('../store', () => ({
  readLatest: vi.fn(),
  writeDoc: vi.fn(),
}));

vi.mock('../../llm', () => ({
  generateLLMResponse: vi.fn(),
}));

vi.mock('../../db', () => ({
  prisma: {
    wikiLintFinding: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { readLatest, writeDoc } from '../store';
import { prisma } from '../../db';
import {
  applyProposal,
  buildQuery,
  buildUserPrompt,
  findMissingFields,
  fingerprintProposal,
  imputeCompanyFacts,
  isFieldPresent,
  listImputationProposals,
  parseProposal,
  persistProposals,
  upsertFactsSection,
  type ImputationProposal,
  type LLMFn,
} from './imputation';

const mockedReadLatest = readLatest as unknown as ReturnType<typeof vi.fn>;
const mockedWriteDoc = writeDoc as unknown as ReturnType<typeof vi.fn>;
const mockedFindUnique = prisma.wikiLintFinding.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = prisma.wikiLintFinding.create as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = prisma.wikiLintFinding.update as unknown as ReturnType<typeof vi.fn>;
const mockedFindMany = prisma.wikiLintFinding.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedReadLatest.mockReset();
  mockedWriteDoc.mockReset();
  mockedFindUnique.mockReset();
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
  mockedFindMany.mockReset();
});

describe('isFieldPresent', () => {
  it('detects headcount via synonym "employees"', () => {
    expect(isFieldPresent('Acme has 200 employees worldwide.', 'headcount')).toBe(true);
  });

  it('returns false when no synonym appears', () => {
    expect(isFieldPresent('Acme builds software.', 'headcount')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isFieldPresent('FOUNDED in 2010', 'foundedYear')).toBe(true);
  });
});

describe('findMissingFields', () => {
  it('returns all fields when content mentions none', () => {
    expect(findMissingFields('Acme is a company.')).toHaveLength(5);
  });

  it('skips fields that are already present', () => {
    const content = 'Industry: SaaS. Founded 2015. Headquartered in Berlin.';
    const missing = findMissingFields(content);
    expect(missing).not.toContain('industry');
    expect(missing).not.toContain('foundedYear');
    expect(missing).not.toContain('hqLocation');
    expect(missing).toContain('headcount');
    expect(missing).toContain('fundingStage');
  });
});

describe('buildQuery', () => {
  it('quotes the company name and appends a field label', () => {
    expect(buildQuery('Acme Co', 'headcount')).toBe('"Acme Co" employee headcount');
  });
});

describe('buildUserPrompt', () => {
  it('includes the company, field, and numbered snippets', () => {
    const results: SearchResult[] = [
      { title: 'Acme on LinkedIn', url: 'https://linkedin.com/acme', snippet: '200+ employees' },
    ];
    const prompt = buildUserPrompt('Acme', 'headcount', results);
    expect(prompt).toContain('Company: Acme');
    expect(prompt).toContain('employee headcount');
    expect(prompt).toContain('[1] Acme on LinkedIn');
    expect(prompt).toContain('https://linkedin.com/acme');
  });
});

describe('parseProposal', () => {
  const allowed = new Set(['https://linkedin.com/acme']);

  it('parses a well-formed proposal', () => {
    const raw = JSON.stringify({
      value: '~200 employees',
      confidence: 'MEDIUM',
      sourceUrl: 'https://linkedin.com/acme',
      quote: 'Acme has 200+ employees',
    });
    const p = parseProposal(raw, 'headcount', allowed);
    expect(p).toEqual({
      field: 'headcount',
      value: '~200 employees',
      confidence: 'MEDIUM',
      sourceUrl: 'https://linkedin.com/acme',
      quote: 'Acme has 200+ employees',
    });
  });

  it('returns null when value is null (no answer found)', () => {
    expect(parseProposal('{"value": null}', 'headcount', allowed)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseProposal('not json {', 'headcount', allowed)).toBeNull();
  });

  it('strips ```json fences before parsing', () => {
    const raw =
      '```json\n{"value":"SaaS","confidence":"HIGH","sourceUrl":"https://linkedin.com/acme","quote":"SaaS company"}\n```';
    const p = parseProposal(raw, 'industry', allowed);
    expect(p?.value).toBe('SaaS');
  });

  it('rejects sourceUrl not in allowedUrls (anti-hallucination)', () => {
    const raw = JSON.stringify({
      value: '200',
      confidence: 'HIGH',
      sourceUrl: 'https://made-up.example.com',
      quote: 'q',
    });
    expect(parseProposal(raw, 'headcount', allowed)).toBeNull();
  });

  it('defaults invalid confidence to LOW', () => {
    const raw = JSON.stringify({
      value: 'SaaS',
      confidence: 'BANANA',
      sourceUrl: 'https://linkedin.com/acme',
      quote: 'q',
    });
    expect(parseProposal(raw, 'industry', allowed)?.confidence).toBe('LOW');
  });
});

describe('imputeCompanyFacts', () => {
  const okLLM = (payload: object): LLMFn =>
    vi.fn().mockResolvedValue(JSON.stringify(payload));

  it('returns empty when no company doc exists', async () => {
    mockedReadLatest.mockResolvedValue(null);
    const result = await imputeCompanyFacts('p1', 'Acme', {
      search: new StubSearchProvider(),
      llm: vi.fn(),
    });
    expect(result.proposals).toEqual([]);
    expect(result.searchCalls).toBe(0);
    expect(result.llmCalls).toBe(0);
  });

  it('skips fields already present and proposes for missing ones', async () => {
    mockedReadLatest.mockResolvedValue({
      content: 'Industry: SaaS. Founded 2015. Headquartered in Berlin. Funding: Series A.',
    });
    const search = new StubSearchProvider([
      { title: 't', url: 'https://src.example.com', snippet: '200 employees' },
    ]);
    const llm = okLLM({
      value: '~200',
      confidence: 'MEDIUM',
      sourceUrl: 'https://src.example.com',
      quote: '200 employees',
    });
    const result = await imputeCompanyFacts('p1', 'Acme', { search, llm });

    expect(result.missingFields).toEqual(['headcount']);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].field).toBe('headcount');
    expect(result.searchCalls).toBe(1);
    expect(result.llmCalls).toBe(1);
  });

  it('drops malformed LLM output without throwing', async () => {
    mockedReadLatest.mockResolvedValue({ content: 'bare doc' });
    const search = new StubSearchProvider([
      { title: 't', url: 'https://src.example.com', snippet: 's' },
    ]);
    const llm: LLMFn = vi.fn().mockResolvedValue('not json at all');
    const result = await imputeCompanyFacts('p1', 'Acme', { search, llm });
    expect(result.proposals).toEqual([]);
    expect(result.llmCalls).toBe(5); // one per missing field, all dropped
  });

  it('skips fields whose search call throws', async () => {
    mockedReadLatest.mockResolvedValue({ content: 'bare doc' });
    const search: StubSearchProvider = {
      name: 'broken',
      calls: [],
      search: vi.fn().mockRejectedValue(new Error('network')),
    } as unknown as StubSearchProvider;
    const llm = vi.fn();
    const result = await imputeCompanyFacts('p1', 'Acme', { search, llm });
    expect(result.proposals).toEqual([]);
    expect(result.searchCalls).toBe(0);
    expect(result.llmCalls).toBe(0);
    expect(llm).not.toHaveBeenCalled();
  });

  it('caps work at 5 fields even if more were somehow missing', async () => {
    mockedReadLatest.mockResolvedValue({ content: '' });
    const search = new StubSearchProvider([
      { title: 't', url: 'https://src.example.com', snippet: 's' },
    ]);
    const llm: LLMFn = vi.fn().mockResolvedValue('{"value": null}');
    const result = await imputeCompanyFacts('p1', 'Acme', { search, llm });
    expect(result.searchCalls).toBeLessThanOrEqual(5);
    expect(result.llmCalls).toBeLessThanOrEqual(5);
  });
});

describe('fingerprintProposal', () => {
  it('is stable across calls with the same inputs', () => {
    const a = fingerprintProposal('p1', 'companies/acme/index.md', 'headcount');
    const b = fingerprintProposal('p1', 'companies/acme/index.md', 'headcount');
    expect(a).toBe(b);
  });

  it('differs across fields for the same company', () => {
    const a = fingerprintProposal('p1', 'companies/acme/index.md', 'headcount');
    const b = fingerprintProposal('p1', 'companies/acme/index.md', 'industry');
    expect(a).not.toBe(b);
  });

  it('differs across projects for the same field', () => {
    const a = fingerprintProposal('p1', 'companies/acme/index.md', 'headcount');
    const b = fingerprintProposal('p2', 'companies/acme/index.md', 'headcount');
    expect(a).not.toBe(b);
  });
});

describe('persistProposals', () => {
  const proposal = (field: ImputationProposal['field']): ImputationProposal => ({
    field,
    value: '~200',
    confidence: 'MEDIUM',
    sourceUrl: 'https://src.example.com',
    quote: '200 employees',
  });

  it('creates a new finding when none exists', async () => {
    mockedFindUnique.mockResolvedValue(null);
    mockedCreate.mockResolvedValue({ id: 'f1' });

    const result = await persistProposals('p1', 'Acme', [proposal('headcount')]);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockedCreate).toHaveBeenCalledOnce();
    const createArg = mockedCreate.mock.calls[0][0].data;
    expect(createArg.kind).toBe('MISSING_DATA');
    expect(createArg.severity).toBe('MEDIUM');
    expect(createArg.title).toBe('Missing: headcount');
    expect(createArg.docPaths).toEqual(['companies/acme/index.md']);
    expect(createArg.evidence[0].field).toBe('headcount');
  });

  it('updates an existing finding instead of duplicating (idempotent re-run)', async () => {
    mockedFindUnique.mockResolvedValue({ id: 'existing' });
    mockedUpdate.mockResolvedValue({ id: 'existing' });

    const result = await persistProposals('p1', 'Acme', [proposal('headcount')]);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedUpdate).toHaveBeenCalledOnce();
  });

  it('maps confidence to severity', async () => {
    mockedFindUnique.mockResolvedValue(null);
    mockedCreate.mockResolvedValue({ id: 'f1' });

    await persistProposals('p1', 'Acme', [
      { ...proposal('industry'), confidence: 'HIGH' },
    ]);

    expect(mockedCreate.mock.calls[0][0].data.severity).toBe('HIGH');
  });

  it('returns empty result when no proposals provided', async () => {
    const result = await persistProposals('p1', 'Acme', []);
    expect(result).toEqual({ created: 0, updated: 0, rows: [] });
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });
});

describe('listImputationProposals', () => {
  it('queries OPEN MISSING_DATA findings by default', async () => {
    mockedFindMany.mockResolvedValue([{ id: 'f1' }]);
    const rows = await listImputationProposals('p1');
    expect(rows).toHaveLength(1);
    const where = mockedFindMany.mock.calls[0][0].where;
    expect(where).toEqual({ projectId: 'p1', status: 'OPEN', kind: 'MISSING_DATA' });
  });

  it('honors a custom status filter', async () => {
    mockedFindMany.mockResolvedValue([]);
    await listImputationProposals('p1', 'DISMISSED');
    expect(mockedFindMany.mock.calls[0][0].where.status).toBe('DISMISSED');
  });
});

describe('upsertFactsSection', () => {
  const ev = {
    field: 'headcount' as const,
    value: '~250',
    confidence: 'HIGH' as const,
    sourceUrl: 'https://example.com/about',
    quote: 'we are 250',
  };

  it('creates a Facts section when none exists', () => {
    const out = upsertFactsSection('# Acme\n\nSome text.', ev);
    expect(out).toContain('## Facts');
    expect(out).toContain('- **Headcount:** ~250 — [source](https://example.com/about)');
  });

  it('appends under existing Facts section without touching later sections', () => {
    const before = '# Acme\n\n## Facts\n\n- **Industry:** SaaS — [source](https://x.com)\n\n## Notes\n\nstuff';
    const out = upsertFactsSection(before, ev);
    expect(out).toContain('- **Industry:** SaaS');
    expect(out).toContain('- **Headcount:** ~250');
    expect(out.indexOf('- **Headcount:**')).toBeLessThan(out.indexOf('## Notes'));
  });

  it('is idempotent when the same bullet already exists', () => {
    const before = '# Acme\n\n## Facts\n\n- **Headcount:** ~250 — [source](https://example.com/about)\n';
    expect(upsertFactsSection(before, ev)).toBe(before);
  });

  it('replaces the bullet for the same field when value differs', () => {
    const before = '# Acme\n\n## Facts\n\n- **Headcount:** 100 — [source](https://old.com)\n';
    const out = upsertFactsSection(before, ev);
    expect(out).toContain('- **Headcount:** ~250 — [source](https://example.com/about)');
    expect(out).not.toContain('100 — [source](https://old.com)');
  });
});

describe('applyProposal', () => {
  const baseFinding = {
    id: 'find-1',
    projectId: 'p1',
    kind: 'MISSING_DATA',
    docPaths: ['companies/acme/index'],
    evidence: [
      {
        field: 'headcount',
        value: '~250',
        confidence: 'HIGH',
        sourceUrl: 'https://example.com/about',
        quote: 'we are 250',
      },
    ],
  };

  it('writes a new doc version with the fact and marks finding RESOLVED', async () => {
    mockedFindUnique.mockResolvedValueOnce(baseFinding);
    mockedReadLatest.mockResolvedValue({
      projectId: 'p1',
      path: 'companies/acme/index',
      kind: 'COMPANY',
      content: '# Acme\n\nA company.',
      frontmatter: { title: 'Acme', backlinks: [] },
      sources: [],
    });
    mockedWriteDoc.mockResolvedValue({
      doc: { version: 2 },
      created: false,
      versionBumped: true,
    });
    mockedUpdate.mockResolvedValue({});

    const result = await applyProposal('find-1');

    expect(result.status).toBe('APPLIED');
    expect(result.newVersion).toBe(2);
    const writeCall = mockedWriteDoc.mock.calls[0][0];
    expect(writeCall.content).toContain('## Facts');
    expect(writeCall.content).toContain('- **Headcount:** ~250');
    expect(writeCall.sources).toContainEqual({ type: 'wiki', id: 'imputation:find-1' });
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: 'find-1' },
      data: expect.objectContaining({ status: 'RESOLVED' }),
    });
  });

  it('returns ALREADY_PRESENT when fact is already in the doc', async () => {
    mockedFindUnique.mockResolvedValueOnce(baseFinding);
    mockedReadLatest.mockResolvedValue({
      projectId: 'p1',
      path: 'companies/acme/index',
      kind: 'COMPANY',
      content: '# Acme\n\n## Facts\n\n- **Headcount:** ~250 — [source](https://example.com/about)\n',
      frontmatter: { title: 'Acme' },
      sources: [],
    });
    mockedWriteDoc.mockResolvedValue({
      doc: { version: 1 },
      created: false,
      versionBumped: false,
    });
    mockedUpdate.mockResolvedValue({});

    const result = await applyProposal('find-1');
    expect(result.status).toBe('ALREADY_PRESENT');
  });

  it('throws when finding is not MISSING_DATA', async () => {
    mockedFindUnique.mockResolvedValueOnce({ ...baseFinding, kind: 'CONTRADICTION' });
    await expect(applyProposal('find-1')).rejects.toThrow(/MISSING_DATA/);
  });

  it('throws when company doc is missing', async () => {
    mockedFindUnique.mockResolvedValueOnce(baseFinding);
    mockedReadLatest.mockResolvedValue(null);
    await expect(applyProposal('find-1')).rejects.toThrow(/Company doc not found/);
  });
});
