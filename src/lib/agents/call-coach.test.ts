import { describe, it, expect } from 'vitest';
import { parseCoachReview, runCallCoach, type CoachInput } from './call-coach';
import type { LLMCaller } from './runtime';

describe('parseCoachReview', () => {
  it('accepts a fully populated review', () => {
    const result = parseCoachReview({
      missedQuestions: ['What is your budget?'],
      unaddressedObjections: [
        { objection: 'Pricing seems high', suggestedResponse: 'Frame value vs. status quo' },
      ],
      commitments: [
        { description: 'Send pricing deck', suggestedDueDate: '2026-05-10' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.missedQuestions).toHaveLength(1);
      expect(result.value.unaddressedObjections[0].objection).toBe('Pricing seems high');
      expect(result.value.commitments[0].suggestedDueDate).toBe('2026-05-10');
    }
  });

  it('accepts empty arrays for all categories', () => {
    const result = parseCoachReview({
      missedQuestions: [],
      unaddressedObjections: [],
      commitments: [],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts commitments without suggestedDueDate', () => {
    const result = parseCoachReview({
      missedQuestions: [],
      unaddressedObjections: [],
      commitments: [{ description: 'Follow up next week' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.commitments[0].suggestedDueDate).toBeUndefined();
    }
  });

  it('rejects when a top-level key is missing', () => {
    const result = parseCoachReview({
      missedQuestions: [],
      unaddressedObjections: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when an objection lacks suggestedResponse', () => {
    const result = parseCoachReview({
      missedQuestions: [],
      unaddressedObjections: [{ objection: 'Too expensive' }],
      commitments: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects empty strings inside arrays', () => {
    const result = parseCoachReview({
      missedQuestions: [''],
      unaddressedObjections: [],
      commitments: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when arrays are not arrays', () => {
    const result = parseCoachReview({
      missedQuestions: 'not-an-array',
      unaddressedObjections: [],
      commitments: [],
    });
    expect(result.ok).toBe(false);
  });

  it('strips unknown extra keys without failing', () => {
    const result = parseCoachReview({
      missedQuestions: ['Q1'],
      unaddressedObjections: [],
      commitments: [],
      hallucinatedExtra: 'should be ignored',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as unknown as Record<string, unknown>).hallucinatedExtra).toBeUndefined();
    }
  });
});

describe('runCallCoach', () => {
  const baseInput: CoachInput = {
    transcript: 'Rep: Tell me about your stack. Prospect: We use Snowflake. Rep: Cool.',
    structuredNotes: {
      summary: 'Discussed stack briefly',
      keyPoints: ['Uses Snowflake'],
      objections: ['Budget is tight this quarter'],
    },
    lead: {
      firstName: 'Alex',
      lastName: 'Doe',
      company: 'Acme',
      title: 'VP Data',
      currentStage: 'Demo',
      conversationStage: 'Demo',
    },
    project: { name: 'Q1 SMB', idea: 'data platform', approach: 'cold outbound' },
    callDate: new Date('2026-05-07'),
  };

  it('passes the LLM a structured prompt and returns parsed review', async () => {
    const captured: { systemPrompt?: string; userPrompt?: string } = {};
    const llm: LLMCaller = async (messages) => {
      captured.systemPrompt = messages[0].content;
      captured.userPrompt = messages[1].content;
      return JSON.stringify({
        missedQuestions: ['What is the timeline?'],
        unaddressedObjections: [
          { objection: 'Budget is tight this quarter', suggestedResponse: 'Offer phased rollout' },
        ],
        commitments: [{ description: 'Send case study', suggestedDueDate: '2026-05-10' }],
      });
    };

    const review = await runCallCoach(baseInput, llm);
    expect(review.missedQuestions).toEqual(['What is the timeline?']);
    expect(review.unaddressedObjections[0].suggestedResponse).toBe('Offer phased rollout');
    expect(review.commitments[0].suggestedDueDate).toBe('2026-05-10');
    expect(captured.userPrompt).toContain('Acme');
    expect(captured.userPrompt).toContain('Budget is tight this quarter');
    expect(captured.userPrompt).toContain('2026-05-07');
  });

  it('handles missing transcript and structured notes', async () => {
    const llm: LLMCaller = async () =>
      JSON.stringify({ missedQuestions: [], unaddressedObjections: [], commitments: [] });

    const review = await runCallCoach(
      { ...baseInput, transcript: null, structuredNotes: null },
      llm,
    );
    expect(review.missedQuestions).toEqual([]);
  });
});
