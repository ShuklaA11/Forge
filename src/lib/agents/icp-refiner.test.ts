import { describe, expect, it } from 'vitest';
import {
  buildIcpPrompt,
  parseIcpRefinement,
  type IcpSignals,
} from './icp-refiner';

const baseSignals: IcpSignals = {
  totalClosed: 8,
  wonCount: 5,
  lostCount: 3,
  winRate: 0.625,
  closedLeads: [
    {
      leadId: 'l1',
      outcome: 'WON',
      company: 'Acme',
      title: 'CTO',
      role: 'C_SUITE',
      companySize: 'SIZE_11_50',
      companyType: 'SMB',
      industry: 'fintech',
      source: 'REFERRAL',
    },
  ],
  attributeBreakdown: [
    { attribute: 'companySize', value: 'SIZE_11_50', wonCount: 4, lostCount: 0 },
    { attribute: 'industry', value: 'fintech', wonCount: 3, lostCount: 2 },
  ],
  generatedAt: '2026-05-22T00:00:00.000Z',
};

describe('parseIcpRefinement', () => {
  it('accepts a valid refinement', () => {
    const result = parseIcpRefinement({
      summary: 'Tighten focus on SMB fintech',
      proposals: [
        {
          field: 'idea',
          current: 'sell widgets',
          proposed: 'sell widgets to fintech SMBs',
          rationale: 'won 3 of 5 fintech deals',
          evidence: ['fintech industry: 3 won / 2 lost'],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposals).toHaveLength(1);
    expect(result.value.proposals[0].field).toBe('idea');
  });

  it('rejects unknown field names', () => {
    const result = parseIcpRefinement({
      summary: 's',
      proposals: [
        {
          field: 'pricing',
          current: null,
          proposed: 'p',
          rationale: 'r',
          evidence: ['e'],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects proposals with empty evidence array', () => {
    const result = parseIcpRefinement({
      summary: 's',
      proposals: [
        { field: 'idea', current: null, proposed: 'p', rationale: 'r', evidence: [] },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts null current values', () => {
    const result = parseIcpRefinement({
      summary: 's',
      proposals: [
        { field: 'description', current: null, proposed: 'p', rationale: 'r', evidence: ['x'] },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an empty proposals array', () => {
    const result = parseIcpRefinement({ summary: 'no changes', proposals: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposals).toEqual([]);
  });

  it('rejects non-object input', () => {
    expect(parseIcpRefinement(null).ok).toBe(false);
    expect(parseIcpRefinement('text').ok).toBe(false);
  });

  it('rejects missing summary', () => {
    const result = parseIcpRefinement({ proposals: [] });
    expect(result.ok).toBe(false);
  });
});

describe('buildIcpPrompt', () => {
  const project = {
    name: 'Q2 SMB Outreach',
    idea: 'sell widgets',
    approach: 'cold email',
    description: 'targeting SMBs',
  };

  it('embeds current ICP fields in the user prompt', () => {
    const { userPrompt } = buildIcpPrompt(baseSignals, project);
    expect(userPrompt).toContain('Q2 SMB Outreach');
    expect(userPrompt).toContain('idea: sell widgets');
    expect(userPrompt).toContain('approach: cold email');
    expect(userPrompt).toContain('description: targeting SMBs');
  });

  it('embeds the signals JSON', () => {
    const { userPrompt } = buildIcpPrompt(baseSignals, project);
    expect(userPrompt).toContain('"winRate": 0.625');
    expect(userPrompt).toContain('"company": "Acme"');
    expect(userPrompt).toContain('"attribute": "companySize"');
  });

  it('renders (not set) for null ICP fields', () => {
    const { userPrompt } = buildIcpPrompt(baseSignals, {
      name: 'P',
      idea: null,
      approach: null,
      description: null,
    });
    expect(userPrompt).toContain('idea: (not set)');
    expect(userPrompt).toContain('approach: (not set)');
    expect(userPrompt).toContain('description: (not set)');
  });

  it('instructs the model to ground in signals and cap proposals', () => {
    const { systemPrompt } = buildIcpPrompt(baseSignals, project);
    expect(systemPrompt.toLowerCase()).toContain('never invent');
    expect(systemPrompt).toContain('Cap at 3 proposals');
    expect(systemPrompt).toContain('"field":"idea|approach|description"');
  });
});
