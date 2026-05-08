import { describe, it, expect } from 'vitest';
import { parseDraft, defaultChannel } from './outreach-draft';

describe('parseDraft', () => {
  it('extracts subject and body from a well-formed response', () => {
    const raw = `Subject: Quick question about your Q3 plans
Body:
Hi Jordan,

Saw you posted about the new pricing rollout. Curious how it's landing
with mid-market accounts.

— Alex`;
    const { subject, body } = parseDraft(raw);
    expect(subject).toBe('Quick question about your Q3 plans');
    expect(body.startsWith('Hi Jordan,')).toBe(true);
    expect(body).not.toContain('Body:');
    expect(body).not.toContain('Subject:');
  });

  it('handles missing Subject line', () => {
    const raw = `Body:
Hi there, following up on my last note.`;
    const { subject, body } = parseDraft(raw);
    expect(subject).toBe('');
    expect(body).toBe('Hi there, following up on my last note.');
  });

  it('handles n/a subject for non-email channels', () => {
    const raw = `Subject: n/a
Body:
Saw your post on AI procurement — curious how you're thinking about vendor consolidation.`;
    const { subject, body } = parseDraft(raw);
    expect(subject).toBe('n/a');
    expect(body.startsWith('Saw your post')).toBe(true);
  });

  it('is case-insensitive on the Subject/Body labels', () => {
    const raw = `subject: hello
body:
hi`;
    const { subject, body } = parseDraft(raw);
    expect(subject).toBe('hello');
    expect(body).toBe('hi');
  });

  it('falls back to whole content when no labels are present', () => {
    const raw = 'Hey, just checking in.';
    const { subject, body } = parseDraft(raw);
    expect(subject).toBe('');
    expect(body).toBe('Hey, just checking in.');
  });

  it('preserves multi-paragraph body content', () => {
    const raw = `Subject: Re: pilot

Body:
First paragraph.

Second paragraph with a list:
- one
- two

Third paragraph.`;
    const { body } = parseDraft(raw);
    expect(body).toContain('First paragraph.');
    expect(body).toContain('- one');
    expect(body).toContain('Third paragraph.');
  });

  it('trims surrounding whitespace from body', () => {
    const raw = `Subject: x
Body:


  Hello there.

`;
    const { body } = parseDraft(raw);
    expect(body).toBe('Hello there.');
  });
});

describe('defaultChannel', () => {
  it('returns EMAIL when an email is present', () => {
    expect(defaultChannel('lead@example.com')).toBe('EMAIL');
  });

  it('returns LINKEDIN when email is null', () => {
    expect(defaultChannel(null)).toBe('LINKEDIN');
  });

  it('returns LINKEDIN when email is empty string', () => {
    expect(defaultChannel('')).toBe('LINKEDIN');
  });
});
