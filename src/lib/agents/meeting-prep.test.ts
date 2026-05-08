import { describe, it, expect } from 'vitest';
import { parseMeetingPrep, runMeetingPrep, type PrepInput } from './meeting-prep';
import type { LLMCaller } from './runtime';

describe('parseMeetingPrep', () => {
  it('accepts a fully populated brief', () => {
    const result = parseMeetingPrep({
      historyRecap: 'Met twice, demo went well.',
      recentSignals: ['Hiring data engineers'],
      suggestedQuestions: ['What is your timeline?'],
      likelyObjections: ['Pricing concerns'],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts empty arrays when historyRecap is present', () => {
    const result = parseMeetingPrep({
      historyRecap: 'No prior contact.',
      recentSignals: [],
      suggestedQuestions: [],
      likelyObjections: [],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects when historyRecap is empty', () => {
    const result = parseMeetingPrep({
      historyRecap: '',
      recentSignals: [],
      suggestedQuestions: [],
      likelyObjections: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when a section is missing', () => {
    const result = parseMeetingPrep({
      historyRecap: 'ok',
      recentSignals: [],
      suggestedQuestions: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects empty strings inside arrays', () => {
    const result = parseMeetingPrep({
      historyRecap: 'ok',
      recentSignals: [''],
      suggestedQuestions: [],
      likelyObjections: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-array section', () => {
    const result = parseMeetingPrep({
      historyRecap: 'ok',
      recentSignals: 'not an array',
      suggestedQuestions: [],
      likelyObjections: [],
    });
    expect(result.ok).toBe(false);
  });

  it('strips unknown extra keys', () => {
    const result = parseMeetingPrep({
      historyRecap: 'ok',
      recentSignals: [],
      suggestedQuestions: [],
      likelyObjections: [],
      hallucinated: 'ignored',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as unknown as Record<string, unknown>).hallucinated).toBeUndefined();
    }
  });
});

describe('runMeetingPrep', () => {
  const baseInput: PrepInput = {
    lead: {
      firstName: 'Alex',
      lastName: 'Doe',
      company: 'Acme',
      title: 'VP Data',
      currentStage: 'Demo',
      conversationStage: 'Demo',
    },
    project: { name: 'Q1 SMB', idea: 'data platform', approach: 'cold outbound' },
    reminder: {
      title: 'Discovery call',
      notes: 'second meeting',
      dueDate: new Date('2026-05-12'),
    },
    touchpoints: [
      {
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        subject: 'Intro',
        body: 'Hi Alex, would love to chat.',
        notes: null,
        occurredAt: new Date('2026-05-01'),
      },
      {
        channel: 'EMAIL',
        direction: 'INBOUND',
        subject: 'Re: Intro',
        body: 'Sounds interesting, send a calendar link.',
        notes: null,
        occurredAt: new Date('2026-05-03'),
      },
    ],
    wikiDocs: [
      { title: 'Acme — Company Page', excerpt: 'Acme builds analytics tooling for SMBs.' },
    ],
    webResults: [
      {
        title: 'Acme raises Series B',
        url: 'https://news.example.com/acme-b',
        snippet: 'Acme announced a $40M Series B led by Sequoia.',
      },
    ],
  };

  it('feeds touchpoints, wiki, and web results into the prompt and returns a parsed brief', async () => {
    let userPromptCaptured = '';
    const llm: LLMCaller = async (messages) => {
      userPromptCaptured = messages[1].content;
      return JSON.stringify({
        historyRecap: 'Two emails so far; prospect agreed to a call.',
        recentSignals: ['Acme just raised a Series B'],
        suggestedQuestions: ['How will the new funding shift your data priorities?'],
        likelyObjections: ['Hiring is a higher priority than tooling spend'],
      });
    };

    const brief = await runMeetingPrep(baseInput, llm);
    expect(brief.recentSignals).toEqual(['Acme just raised a Series B']);
    expect(userPromptCaptured).toContain('Acme');
    expect(userPromptCaptured).toContain('Sounds interesting, send a calendar link');
    expect(userPromptCaptured).toContain('Acme — Company Page');
    expect(userPromptCaptured).toContain('Acme raises Series B');
    expect(userPromptCaptured).toContain('Discovery call');
  });

  it('handles empty touchpoints, wiki, and web sources', async () => {
    let userPromptCaptured = '';
    const llm: LLMCaller = async (messages) => {
      userPromptCaptured = messages[1].content;
      return JSON.stringify({
        historyRecap: 'No prior contact.',
        recentSignals: [],
        suggestedQuestions: ['What problem are you trying to solve?'],
        likelyObjections: [],
      });
    };

    const brief = await runMeetingPrep(
      { ...baseInput, touchpoints: [], wikiDocs: [], webResults: [] },
      llm,
    );
    expect(brief.historyRecap).toBe('No prior contact.');
    expect(userPromptCaptured).toContain('(no touchpoints logged yet)');
    expect(userPromptCaptured).toContain('(no wiki context)');
    expect(userPromptCaptured).toContain('(no fresh web results)');
  });
});
