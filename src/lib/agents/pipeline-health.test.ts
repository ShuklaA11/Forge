import { describe, expect, it } from 'vitest';
import { buildHealthPrompt, parseHealthDigest, type PipelineSignals } from './pipeline-health';

const baseSignals: PipelineSignals = {
  totalLeads: 12,
  stageDistribution: [
    { stage: 'RESEARCHED', count: 4 },
    { stage: 'CONTACTED', count: 6 },
    { stage: 'RESPONDED', count: 2 },
  ],
  distributionDelta: [
    { stage: 'CONTACTED', current: 6, prior: 3, delta: 3 },
  ],
  stalledLeads: [
    { leadId: 'l1', name: 'Alice Smith', company: 'Acme', stage: 'CONTACTED', daysInStage: 14 },
  ],
  untouchedHighScore: [
    {
      leadId: 'l2',
      name: 'Bob Jones',
      company: 'BigCo',
      priorityScore: 85,
      daysSinceLastTouch: 12,
    },
  ],
  outboundCount: 30,
  replyRate: 0.1,
  generatedAt: '2026-05-09T00:00:00.000Z',
};

describe('parseHealthDigest', () => {
  it('accepts valid digest and sorts findings high → low', () => {
    const result = parseHealthDigest({
      headline: 'Pipeline is leaking at the contacted stage',
      findings: [
        { severity: 'low', title: 'Minor', detail: 'd', suggestedAction: 'a' },
        { severity: 'high', title: 'Big', detail: 'd', suggestedAction: 'a' },
        { severity: 'medium', title: 'Mid', detail: 'd', suggestedAction: 'a' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings.map((f) => f.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('rejects unknown severity', () => {
    const result = parseHealthDigest({
      headline: 'h',
      findings: [{ severity: 'critical', title: 't', detail: 'd', suggestedAction: 'a' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = parseHealthDigest({
      headline: 'h',
      findings: [{ severity: 'high', title: '', detail: 'd', suggestedAction: 'a' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(parseHealthDigest('not json').ok).toBe(false);
    expect(parseHealthDigest(null).ok).toBe(false);
  });

  it('accepts an empty findings array', () => {
    const result = parseHealthDigest({ headline: 'all green', findings: [] });
    expect(result.ok).toBe(true);
  });
});

describe('buildHealthPrompt', () => {
  const project = { name: 'Q2 Outreach', idea: 'sell widgets', approach: 'cold email' };

  it('embeds the signals JSON in the user prompt', () => {
    const { userPrompt } = buildHealthPrompt(baseSignals, project);
    expect(userPrompt).toContain('Q2 Outreach');
    expect(userPrompt).toContain('"company": "Acme"');
    expect(userPrompt).toContain('"replyRate": 0.1');
  });

  it('instructs the model to ground findings and cap at 5', () => {
    const { systemPrompt } = buildHealthPrompt(baseSignals, project);
    expect(systemPrompt.toLowerCase()).toContain('do not invent');
    expect(systemPrompt).toContain('Cap at 5 findings');
    expect(systemPrompt).toContain('"severity":"low|medium|high"');
  });

  it('handles null project fields', () => {
    const { userPrompt } = buildHealthPrompt(baseSignals, {
      name: 'P',
      idea: null,
      approach: null,
    });
    expect(userPrompt).toContain('Idea: n/a');
    expect(userPrompt).toContain('Approach: n/a');
  });
});
