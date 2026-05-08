import { describe, expect, it } from 'vitest';
import { parseTriageOutput } from './reply-triage';

describe('parseTriageOutput', () => {
  it('accepts a valid interested reply with draftReply', () => {
    const result = parseTriageOutput({
      intent: 'interested',
      confidence: 0.9,
      summary: 'Wants a demo next week',
      suggestedAction: 'Send calendar link',
      draftReply: 'Great — here is my calendar link...',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.intent).toBe('interested');
      expect(result.value.draftReply).toBeDefined();
    }
  });

  it('accepts each known intent', () => {
    const intents = [
      'interested',
      'objection',
      'schedule_meeting',
      'unsubscribe',
      'other',
    ] as const;
    for (const intent of intents) {
      const out = parseTriageOutput({
        intent,
        confidence: 0.5,
        summary: 's',
        suggestedAction: 'a',
      });
      expect(out.ok, `intent=${intent}`).toBe(true);
    }
  });

  it('strips draftReply when intent is unsubscribe', () => {
    const result = parseTriageOutput({
      intent: 'unsubscribe',
      confidence: 0.95,
      summary: 'Asked to be removed',
      suggestedAction: 'Pause sequence; do not contact further',
      draftReply: 'Thanks for letting me know...',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.draftReply).toBeUndefined();
    }
  });

  it('rejects unknown intent', () => {
    const result = parseTriageOutput({
      intent: 'maybe_later',
      confidence: 0.5,
      summary: 's',
      suggestedAction: 'a',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects confidence outside 0-1', () => {
    const high = parseTriageOutput({
      intent: 'other',
      confidence: 1.5,
      summary: 's',
      suggestedAction: 'a',
    });
    const low = parseTriageOutput({
      intent: 'other',
      confidence: -0.1,
      summary: 's',
      suggestedAction: 'a',
    });
    expect(high.ok).toBe(false);
    expect(low.ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    const noSummary = parseTriageOutput({
      intent: 'interested',
      confidence: 0.5,
      suggestedAction: 'a',
    });
    const noAction = parseTriageOutput({
      intent: 'interested',
      confidence: 0.5,
      summary: 's',
    });
    expect(noSummary.ok).toBe(false);
    expect(noAction.ok).toBe(false);
  });

  it('rejects empty summary or suggestedAction', () => {
    const emptySummary = parseTriageOutput({
      intent: 'interested',
      confidence: 0.5,
      summary: '',
      suggestedAction: 'a',
    });
    expect(emptySummary.ok).toBe(false);
  });

  it('reports field path in error message', () => {
    const result = parseTriageOutput({
      intent: 'interested',
      confidence: 'high',
      summary: 's',
      suggestedAction: 'a',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/confidence/);
    }
  });
});
