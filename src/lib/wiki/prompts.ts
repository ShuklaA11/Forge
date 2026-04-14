import type {
  CompanyContext,
  LeadContext,
  CallContext,
  ProjectContext,
  TopicContext,
} from './context';
import { companyIndexPath, personPath, callPath, topicPath, projectIndexPath } from './paths';

export interface PromptPair {
  system: string;
  user: string;
}

const MARKDOWN_RULES = `
OUTPUT RULES:
- Respond ONLY with the markdown body of the wiki page. No preamble, no explanation.
- Use ATX headings (#, ##, ###).
- Use [[wiki-path.md]] format for internal links, where the path is a relative wiki path (e.g. [[companies/acme/index.md]] or [[_objections.md]]).
- Do NOT fabricate facts. If information is missing, say so explicitly ("Unknown", "Not yet captured").
- Preserve direct quotes verbatim and attribute them when possible.
- Keep each section focused; cut filler.
`.trim();

const NO_BLANK_SECTION_RULE = `If a section has no content, write "_No data yet._" rather than omitting the heading.`;

function formatCallBullet(call: { callDate: Date; title: string; sentiment?: string | null }): string {
  const date = call.callDate.toISOString().slice(0, 10);
  const sentiment = call.sentiment ? ` (${call.sentiment.toLowerCase()})` : '';
  return `- ${date} — ${call.title}${sentiment}`;
}

function formatStructuredNotes(notes: unknown): string {
  if (!notes || typeof notes !== 'object') return '';
  const n = notes as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof n.summary === 'string') parts.push(`Summary: ${n.summary}`);
  if (Array.isArray(n.keyPoints) && n.keyPoints.length) {
    parts.push(`Key points: ${n.keyPoints.join('; ')}`);
  }
  if (Array.isArray(n.objections) && n.objections.length) {
    parts.push(`Objections: ${n.objections.join('; ')}`);
  }
  if (Array.isArray(n.quotes) && n.quotes.length) {
    parts.push(`Quotes: ${n.quotes.map((q) => `"${q}"`).join(' | ')}`);
  }
  if (Array.isArray(n.nextSteps) && n.nextSteps.length) {
    parts.push(`Next steps: ${n.nextSteps.join('; ')}`);
  }
  return parts.join('\n');
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function companyPrompt(ctx: CompanyContext): PromptPair {
  const system = `You are writing a wiki page for a company inside a sales/outreach project. ${MARKDOWN_RULES}`;

  const leadsBlock = ctx.leads
    .map(
      (l) =>
        `- ${l.firstName} ${l.lastName} — ${l.title ?? 'role unknown'} (stage: ${l.currentStage}, priority: ${l.priorityScore}) — [[${personPath(ctx.companyName, l.id, `${l.firstName} ${l.lastName}`)}]]`,
    )
    .join('\n') || '_No leads captured._';

  const callsBlock = ctx.calls.length
    ? ctx.calls
        .slice(0, 20)
        .map((c) => {
          const path = callPath(ctx.companyName, c.id, c.callDate, c.title);
          const notes = formatStructuredNotes(c.structuredNotes);
          return `- ${c.callDate.toISOString().slice(0, 10)} — ${c.title} with ${c.lead.firstName} ${c.lead.lastName} — [[${path}]]${notes ? '\n  ' + notes.replace(/\n/g, '\n  ') : ''}`;
        })
        .join('\n')
    : '_No calls logged._';

  const touchpointsBlock = ctx.touchpoints.length
    ? ctx.touchpoints
        .slice(0, 15)
        .map(
          (t) =>
            `- ${t.sentAt.toISOString().slice(0, 10)} [${t.channel}/${t.direction}] ${t.subject ?? t.type} — ${t.lead.firstName} ${t.lead.lastName}${t.gotReply ? ' (replied)' : ''}`,
        )
        .join('\n')
    : '_No touchpoints._';

  const sourcesBlock = ctx.rawSources.length
    ? ctx.rawSources
        .map((s) => `- [${s.kind}] ${s.title}${s.url ? ` (${s.url})` : ''}\n  ${truncate(s.content, 600)}`)
        .join('\n')
    : '_No external sources attached._';

  const user = `
Project: ${ctx.project.name}
Company: ${ctx.companyName}

## Leads at this company
${leadsBlock}

## Call log (most recent first)
${callsBlock}

## Touchpoint log (most recent first)
${touchpointsBlock}

## Attached external sources
${sourcesBlock}

---

Write the wiki page for **${ctx.companyName}** with these sections:
# ${ctx.companyName}
## Overview
(1-2 paragraphs: what the company does, size, industry, where they are in the pipeline)
## People
(Bulleted list linking to each person's wiki page. ${NO_BLANK_SECTION_RULE})
## Engagement history
(Chronological summary of calls and touchpoints, most recent first. Link each call with [[...]]. ${NO_BLANK_SECTION_RULE})
## Current state
(Where things stand right now — pipeline stage, conversation stage, latest signal)
## Open questions
(Things we don't know yet but should. ${NO_BLANK_SECTION_RULE})
## Related
(Links to relevant topic pages like [[_objections.md]] if applicable)
`.trim();

  return { system, user };
}

export function personPrompt(ctx: LeadContext): PromptPair {
  const system = `You are writing a wiki page for an individual person (a lead) inside a sales/outreach project. ${MARKDOWN_RULES}`;

  const companyLink = `[[${companyIndexPath(ctx.lead.company)}]]`;

  const callsBlock = ctx.calls.length
    ? ctx.calls
        .slice(0, 15)
        .map((c) => {
          const path = callPath(ctx.lead.company, c.id, c.callDate, c.title);
          const notes = formatStructuredNotes(c.structuredNotes);
          return `- ${c.callDate.toISOString().slice(0, 10)} — ${c.title} — [[${path}]]${notes ? '\n  ' + notes.replace(/\n/g, '\n  ') : ''}`;
        })
        .join('\n')
    : '_No calls logged._';

  const touchpointsBlock = ctx.touchpoints.length
    ? ctx.touchpoints
        .slice(0, 15)
        .map(
          (t) =>
            `- ${t.sentAt.toISOString().slice(0, 10)} [${t.channel}/${t.direction}] ${t.subject ?? t.type}${t.body ? ' — ' + truncate(t.body, 200) : ''}${t.gotReply ? ' (replied)' : ''}`,
        )
        .join('\n')
    : '_No touchpoints._';

  const stageBlock = ctx.stageHistory.length
    ? ctx.stageHistory
        .map(
          (s) =>
            `- ${s.enteredAt.toISOString().slice(0, 10)}: entered ${s.stage}${s.exitedAt ? ` (exited ${s.exitedAt.toISOString().slice(0, 10)})` : ''}`,
        )
        .join('\n')
    : '_No stage transitions._';

  const user = `
Project: ${ctx.project.name}
Person: ${ctx.lead.firstName} ${ctx.lead.lastName}
Company: ${ctx.lead.company} ${companyLink}
Title: ${ctx.lead.title ?? 'unknown'}
Role level: ${ctx.lead.role}
Current pipeline stage: ${ctx.lead.currentStage}
Current conversation stage: ${ctx.lead.conversationStage}
Priority score: ${ctx.lead.priorityScore}
Notes: ${ctx.lead.notes ?? 'none'}

## Stage history
${stageBlock}

## Calls
${callsBlock}

## Touchpoints
${touchpointsBlock}

---

Write the wiki page with these sections:
# ${ctx.lead.firstName} ${ctx.lead.lastName}
## Role
(Title, level, decision-making authority, backlink to ${companyLink})
## Engagement timeline
(Touchpoint + call history, chronological, most recent first. Link each call with [[...]].)
## Quotes
(Direct quotes from calls — verbatim, attributed to specific calls via [[...]]. ${NO_BLANK_SECTION_RULE})
## Stance
(What this person thinks/feels about our offering right now. Evidence-backed.)
## Next steps
(What's the next move with this person. ${NO_BLANK_SECTION_RULE})
`.trim();

  return { system, user };
}

export function callPrompt(ctx: CallContext): PromptPair {
  const system = `You are writing a wiki page for a single call/conversation. ${MARKDOWN_RULES}`;

  const notes = formatStructuredNotes(ctx.call.structuredNotes);
  const transcript = ctx.call.transcript ? truncate(ctx.call.transcript, 6000) : '';
  const manualNotes = ctx.call.manualNotes ?? '';

  const priorBlock = ctx.priorCalls.length
    ? ctx.priorCalls
        .map((c) => `- ${c.callDate.toISOString().slice(0, 10)} — ${c.title} — [[${callPath(ctx.lead.company, c.id, c.callDate, c.title)}]]`)
        .join('\n')
    : '_No prior calls._';

  const companyLink = `[[${companyIndexPath(ctx.lead.company)}]]`;
  const personLink = `[[${personPath(ctx.lead.company, ctx.lead.id, `${ctx.lead.firstName} ${ctx.lead.lastName}`)}]]`;

  const user = `
Project: ${ctx.project.name}
Call title: ${ctx.call.title}
Date: ${ctx.call.callDate.toISOString().slice(0, 10)}
Duration: ${ctx.call.durationMinutes ?? 'unknown'} minutes
Participant: ${ctx.lead.firstName} ${ctx.lead.lastName} ${personLink}
Company: ${ctx.lead.company} ${companyLink}
Sentiment: ${ctx.call.sentiment ?? 'unknown'}

## Structured notes
${notes || '_None._'}

## Manual notes
${manualNotes || '_None._'}

## Transcript (may be truncated)
${transcript || '_None._'}

## Prior calls with this lead
${priorBlock}

---

Write the wiki page with these sections:
# ${ctx.call.title}
## Context
(One paragraph: who, when, why this call happened. Backlinks: ${personLink}, ${companyLink}.)
## Timeline
(Key moments in order — what was discussed when.)
## Key moments
(Bulleted list of pivotal exchanges, decisions, or reveals.)
## Quotes
(Direct quotes verbatim. ${NO_BLANK_SECTION_RULE})
## Outcome & next steps
(What was decided or committed to, and what happens next.)
## Related
(Backlinks to person, company, and any relevant topic pages like [[_objections.md]], [[_competitors.md]] if they came up.)
`.trim();

  return { system, user };
}

export function projectIndexPrompt(ctx: ProjectContext): PromptPair {
  const system = `You are writing the top-level index page for a project wiki. ${MARKDOWN_RULES}`;

  const companiesBlock = ctx.companies.length
    ? ctx.companies
        .map((c) => `- [[${companyIndexPath(c.name)}|${c.name}]] — ${c.leadCount} lead${c.leadCount === 1 ? '' : 's'}, ${c.callCount} call${c.callCount === 1 ? '' : 's'}`)
        .join('\n')
    : '_No companies yet._';

  const sourcesBlock = ctx.rawSources.length
    ? ctx.rawSources
        .slice(0, 10)
        .map((s) => `- [${s.kind}] ${s.title}${s.url ? ` — ${s.url}` : ''}`)
        .join('\n')
    : '_No external sources attached._';

  const topicsBlock = ['objections', 'competitors', 'icp-patterns', 'pricing-feedback']
    .map((t) => `- [[${topicPath(t)}|${t}]]`)
    .join('\n');

  const user = `
Project: ${ctx.project.name}
Description: ${ctx.project.description ?? 'none'}
Campaign stage: ${ctx.project.campaignStage}
Total leads: ${ctx.leadCount}
Total calls: ${ctx.callCount}

## Companies
${companiesBlock}

## Topic pages
${topicsBlock}

## Recent external sources
${sourcesBlock}

---

Write the project index page with these sections:
# ${ctx.project.name}
## Overview
(What is this project, what is being sold to whom, what stage is it in)
## Companies
(Linked list of all companies — use the [[...]] links from above)
## Topics
(Linked list of topic pages — objections, competitors, ICP patterns, pricing)
## Current signal
(What's the latest read on the project — what's working, what's not, based on the data)
## External sources
(Recent attached articles/URLs/notes)
`.trim();

  return { system, user };
}

export function topicPrompt(ctx: TopicContext): PromptPair {
  const system = `You are writing a topic aggregation page across all calls in a project. ${MARKDOWN_RULES}`;

  const matchesBlock = ctx.matches.length
    ? ctx.matches
        .slice(0, 40)
        .map(
          (m) =>
            `### ${m.lead.firstName} ${m.lead.lastName} (${m.lead.company}) — ${m.call.callDate.toISOString().slice(0, 10)}\n[[${callPath(m.lead.company, m.call.id, m.call.callDate, m.call.title)}]]\n${m.matchedNotes.map((n) => `- ${n}`).join('\n')}`,
        )
        .join('\n\n')
    : '_No matches found across calls._';

  const user = `
Project: ${ctx.project.name}
Topic: ${ctx.topicKey}

## Matching excerpts from calls
${matchesBlock}

---

Write the topic page with these sections:
# ${ctx.topicKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
## Summary
(2-3 paragraphs synthesizing the pattern across all mentions)
## Patterns
(Bulleted list of recurring themes you observe)
## Notable instances
(Link to specific calls with brief context. ${NO_BLANK_SECTION_RULE})
## Recommendations
(What should the project do differently based on this pattern)
## Related
(Links back to [[${projectIndexPath()}]] and any related topic pages)
`.trim();

  return { system, user };
}

export function topicDiscoveryPrompt(existingPages: Array<{ path: string; title: string }>): PromptPair {
  const system = `You read a wiki and propose new topic pages that should exist based on recurring patterns. Respond with strict JSON only — no prose, no markdown code fences.`;

  const pagesBlock = existingPages.map((p) => `- ${p.title} (${p.path})`).join('\n') || '_No pages yet._';

  const user = `
Existing wiki pages in this project:
${pagesBlock}

Fixed topics that already exist or should exist: objections, competitors, icp-patterns, pricing-feedback.

Propose up to 5 NEW topic pages that would be valuable, based on gaps you see. Do not propose topics that overlap with the fixed ones.

Respond with JSON of the form:
[
  { "key": "kebab-case-key", "title": "Human Readable Title", "rationale": "1 sentence why" }
]
`.trim();

  return { system, user };
}
