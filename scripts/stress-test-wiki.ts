/* eslint-disable @typescript-eslint/no-explicit-any */
// Stress test for wiki sub-tasks 1-3.
// Tests context builders, prompt templates, and compile orchestrator directly
// against a real database.

import { prisma } from '../src/lib/db';
import {
  buildCompanyContext,
  buildLeadContext,
  buildCallContext,
  buildProjectContext,
  buildTopicContext,
} from '../src/lib/wiki/context';
import {
  companyPrompt,
  personPrompt,
  callPrompt,
  projectIndexPrompt,
  topicPrompt,
  topicDiscoveryPrompt,
} from '../src/lib/wiki/prompts';
import { compileProject, type GeneratorRegistry } from '../src/lib/wiki/compile';
import type { WriteDocResult } from '../src/lib/wiki/store';
import { companyIndexPath, personPath, callPath, topicPath, projectIndexPath } from '../src/lib/wiki/paths';
import { FIXED_TOPICS } from '../src/lib/wiki/topics';
import { generate as generateTopicDoc } from '../src/lib/wiki/generators/topic';
import { retrieveRelevantDocs, formatDocsForPrompt } from '../src/lib/wiki/retrieve';
import {
  runConsistencyLint,
  parseFindings,
  fingerprintFinding,
  type LLMFn,
} from '../src/lib/wiki/lint/consistency';
import {
  DuckDuckGoProvider,
  StubSearchProvider,
  getSearchProvider,
  parseDuckDuckGoHtml,
  unwrapDuckDuckGoUrl,
} from '../src/lib/wiki/lint/search';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    failed++;
    const err = name + (detail ? ' — ' + detail : '');
    errors.push(err);
    console.log('  \x1b[31m✗\x1b[0m ' + err);
  }
}

function section(title: string) {
  console.log('\n\x1b[1m--- ' + title + ' ---\x1b[0m');
}

async function main() {
  console.log('\x1b[1m=== Wiki Sub-task 3 Module Stress Test ===\x1b[0m');

  // === Setup: clean slate + fixture data ===
  section('Setup');

  // Create project
  const project = await prisma.project.create({
    data: { name: 'Stress Test Project', description: 'automated test fixture', wikiEnabled: true },
  });
  assert('Create project', !!project.id);

  // Create 2 leads at same company
  const lead1 = await prisma.lead.create({
    data: {
      projectId: project.id,
      firstName: 'Alice',
      lastName: 'Anderson',
      company: 'Acme Corp',
      title: 'VP Engineering',
      role: 'VP',
      email: 'alice@acme.test',
      currentStage: 'MEETING_BOOKED',
      priorityScore: 85,
    },
  });
  const lead2 = await prisma.lead.create({
    data: {
      projectId: project.id,
      firstName: 'Bob',
      lastName: 'Brown',
      company: 'Acme Corp',
      title: 'CTO',
      role: 'C_SUITE',
      email: 'bob@acme.test',
      currentStage: 'RESPONDED',
      priorityScore: 92,
    },
  });
  // Lead at a different company
  const lead3 = await prisma.lead.create({
    data: {
      projectId: project.id,
      firstName: 'Carol',
      lastName: 'Chen',
      company: 'Globex Inc',
      title: 'Director of Ops',
      role: 'DIRECTOR',
      currentStage: 'CONTACTED',
      priorityScore: 60,
    },
  });
  assert('Created 3 leads across 2 companies', !!(lead1 && lead2 && lead3));

  // Calls with structured notes (covering multiple topic keywords)
  const call1 = await prisma.call.create({
    data: {
      leadId: lead1.id,
      title: 'Intro with Alice',
      callDate: new Date('2026-03-01T10:00:00Z'),
      durationMinutes: 30,
      transcript: 'Alice: We looked at your pricing and it seems expensive compared to our current vendor.',
      sentiment: 'NEUTRAL',
      structuredNotes: {
        summary: 'Discussed pricing concerns and competitive positioning',
        keyPoints: ['Pricing is high vs competitors', 'Current vendor is Salesforce', 'Use case fit is strong'],
        quotes: ['Your pricing seems expensive compared to what we have now'],
        objections: ['Price point too high', 'Budget constraints this quarter'],
        validationSignals: ['Problem is real', 'They have allocated budget'],
        commitments: ['Follow up in two weeks'],
        nextSteps: ['Send ROI analysis'],
        sentiment: 'neutral',
        sentimentScore: 0,
      },
    },
  });
  const call2 = await prisma.call.create({
    data: {
      leadId: lead1.id,
      title: 'ROI followup with Alice',
      callDate: new Date('2026-03-15T10:00:00Z'),
      durationMinutes: 45,
      sentiment: 'POSITIVE',
      structuredNotes: {
        summary: 'ROI analysis well received, moving to demo phase',
        keyPoints: ['Strong fit for our ICP', 'Ideal use case'],
        quotes: ['This actually makes the cost worth it'],
        objections: [],
        validationSignals: ['Ready to move forward', 'Budget approved'],
        commitments: ['Schedule demo next week'],
        nextSteps: ['Book demo'],
        sentiment: 'positive',
        sentimentScore: 0.7,
      },
    },
  });
  const call3 = await prisma.call.create({
    data: {
      leadId: lead3.id,
      title: 'Discovery with Carol',
      callDate: new Date('2026-03-20T14:00:00Z'),
      durationMinutes: 20,
      sentiment: 'NEGATIVE',
      structuredNotes: {
        summary: 'Not a fit right now',
        keyPoints: ['Already using competitor X', 'Locked in for 12 months'],
        quotes: ['We just signed with a competitor'],
        objections: ['Locked into competitor contract'],
        validationSignals: [],
        commitments: [],
        nextSteps: ['Re-engage in Q4'],
        sentiment: 'negative',
        sentimentScore: -0.3,
      },
    },
  });
  assert('Created 3 calls', !!(call1 && call2 && call3));

  // Touchpoints
  await prisma.touchpoint.createMany({
    data: [
      {
        leadId: lead1.id,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        type: 'INITIAL',
        subject: 'Hi from LeadFlow',
        body: 'Wanted to introduce myself...',
        sentAt: new Date('2026-02-20T09:00:00Z'),
        gotReply: true,
      },
      {
        leadId: lead2.id,
        channel: 'LINKEDIN',
        direction: 'OUTBOUND',
        type: 'INITIAL',
        subject: 'Connection request',
        sentAt: new Date('2026-02-21T09:00:00Z'),
        gotReply: false,
      },
    ],
  });

  // Stage history for lead1
  await prisma.leadStageHistory.create({
    data: { leadId: lead1.id, stage: 'RESEARCHED', enteredAt: new Date('2026-02-15T00:00:00Z') },
  });
  await prisma.leadStageHistory.create({
    data: { leadId: lead1.id, stage: 'MEETING_BOOKED', enteredAt: new Date('2026-03-01T00:00:00Z') },
  });

  // Raw sources, one tagged to Acme
  await prisma.wikiRawSource.createMany({
    data: [
      {
        projectId: project.id,
        kind: 'NOTE',
        title: 'Acme market research',
        content: 'Acme operates in the B2B SaaS space with 200+ employees.',
        metadata: { companyName: 'Acme Corp', tags: ['research'] } as any,
      },
      {
        projectId: project.id,
        kind: 'NOTE',
        title: 'General industry trend',
        content: 'Sector-wide pricing compression of 10%.',
        metadata: { tags: ['industry'] } as any,
      },
    ],
  });
  assert('Created fixture data (touchpoints, stage history, raw sources)', true);

  // ========== TEST GROUP 1: context.ts ==========
  section('1. Context Builders');

  // buildCompanyContext
  {
    const ctx = await buildCompanyContext(project.id, 'Acme Corp');
    assert('buildCompanyContext returns project', ctx.project.id === project.id);
    assert('buildCompanyContext returns 2 leads for Acme', ctx.leads.length === 2, `got ${ctx.leads.length}`);
    assert('buildCompanyContext returns 2 calls for Acme', ctx.calls.length === 2, `got ${ctx.calls.length}`);
    assert('buildCompanyContext returns 1 touchpoint for Acme', ctx.touchpoints.length === 1, `got ${ctx.touchpoints.length}`);
    assert('buildCompanyContext returns only tagged raw sources', ctx.rawSources.length === 1, `got ${ctx.rawSources.length}`);
    assert('Company leads sorted by priority desc', ctx.leads[0].priorityScore >= ctx.leads[1].priorityScore);
    assert('Company calls include lead info', !!ctx.calls[0].lead?.firstName);
  }

  // Unknown company returns empty context
  {
    const ctx = await buildCompanyContext(project.id, 'Nonexistent Co');
    assert('Unknown company → empty leads', ctx.leads.length === 0);
    assert('Unknown company → empty calls', ctx.calls.length === 0);
  }

  // buildLeadContext
  {
    const ctx = await buildLeadContext(project.id, lead1.id);
    assert('buildLeadContext returns the lead', ctx.lead.id === lead1.id);
    assert('buildLeadContext returns 2 calls for lead1', ctx.calls.length === 2);
    assert('buildLeadContext returns 1 touchpoint for lead1', ctx.touchpoints.length === 1);
    assert('buildLeadContext returns 2 stage history entries', ctx.stageHistory.length === 2);
    assert('Stage history sorted by enteredAt asc', ctx.stageHistory[0].stage === 'RESEARCHED');
  }

  // buildLeadContext cross-project rejection
  {
    const otherProject = await prisma.project.create({ data: { name: 'Other' } });
    try {
      await buildLeadContext(otherProject.id, lead1.id);
      assert('Cross-project buildLeadContext should throw', false);
    } catch (e: any) {
      assert('Cross-project buildLeadContext throws', e.message.includes('does not belong'));
    }
    await prisma.project.delete({ where: { id: otherProject.id } });
  }

  // buildCallContext
  {
    const ctx = await buildCallContext(project.id, call2.id);
    assert('buildCallContext returns call', ctx.call.id === call2.id);
    assert('buildCallContext returns lead', ctx.lead.id === lead1.id);
    assert('buildCallContext returns 1 prior call', ctx.priorCalls.length === 1, `got ${ctx.priorCalls.length}`);
    assert('Prior call is call1', ctx.priorCalls[0].id === call1.id);
  }

  // Earliest call has no priors
  {
    const ctx = await buildCallContext(project.id, call1.id);
    assert('First call has 0 prior calls', ctx.priorCalls.length === 0);
  }

  // buildProjectContext
  {
    const ctx = await buildProjectContext(project.id);
    assert('buildProjectContext leadCount = 3', ctx.leadCount === 3);
    assert('buildProjectContext callCount = 3', ctx.callCount === 3);
    assert('buildProjectContext 2 companies', ctx.companies.length === 2);
    assert(
      'buildProjectContext companies sorted by leadCount desc',
      ctx.companies[0].leadCount >= ctx.companies[1].leadCount,
    );
    assert('Acme has 2 leads', ctx.companies.find((c) => c.name === 'Acme Corp')?.leadCount === 2);
    assert('Acme has 2 calls', ctx.companies.find((c) => c.name === 'Acme Corp')?.callCount === 2);
    assert('2 raw sources visible', ctx.rawSources.length === 2);
  }

  // buildTopicContext - objections
  {
    const ctx = await buildTopicContext(project.id, 'objections');
    assert('Topic objections has matches', ctx.matches.length >= 1, `got ${ctx.matches.length}`);
    const hasPriceObjection = ctx.matches.some((m) =>
      m.matchedNotes.some((n) => n.toLowerCase().includes('price') || n.toLowerCase().includes('budget')),
    );
    assert('Topic objections finds price objection', hasPriceObjection);
  }

  // buildTopicContext - competitors
  {
    const ctx = await buildTopicContext(project.id, 'competitors');
    assert('Topic competitors has matches', ctx.matches.length >= 1, `got ${ctx.matches.length}`);
  }

  // Topic with no matches
  {
    const ctx = await buildTopicContext(project.id, 'pricing-feedback');
    assert('Topic pricing-feedback has matches', ctx.matches.length >= 1);
  }

  // Non-existent project
  {
    try {
      await buildProjectContext('nonexistent-id');
      assert('Non-existent project should throw', false);
    } catch (e: any) {
      assert('Non-existent project throws', e.message.includes('not found'));
    }
  }

  // ========== TEST GROUP 2: prompts.ts ==========
  section('2. Prompt Templates');

  const companyCtx = await buildCompanyContext(project.id, 'Acme Corp');
  const leadCtx = await buildLeadContext(project.id, lead1.id);
  const callCtx = await buildCallContext(project.id, call2.id);
  const projectCtx = await buildProjectContext(project.id);
  const topicCtx = await buildTopicContext(project.id, 'objections');

  // companyPrompt
  {
    const p = companyPrompt(companyCtx);
    assert('companyPrompt has system text', p.system.length > 0);
    assert('companyPrompt mentions company name', p.user.includes('Acme Corp'));
    assert('companyPrompt mentions leads', p.user.includes('Alice') && p.user.includes('Bob'));
    assert('companyPrompt includes call log', p.user.includes('Intro with Alice'));
    assert('companyPrompt includes raw source', p.user.includes('Acme market research'));
    assert('companyPrompt has markdown rules', p.system.includes('markdown'));
    assert('companyPrompt instructs [[...]]' , p.system.includes('[[wiki-path'));
    // Verify backlinks are valid paths
    assert(
      'companyPrompt contains person backlinks',
      p.user.includes(personPath('Acme Corp', lead1.id, 'Alice Anderson')) ||
        p.user.includes(personPath('Acme Corp', lead2.id, 'Bob Brown')),
    );
  }

  // personPrompt
  {
    const p = personPrompt(leadCtx);
    assert('personPrompt mentions full name', p.user.includes('Alice Anderson'));
    assert('personPrompt mentions title', p.user.includes('VP Engineering'));
    assert('personPrompt mentions stage history', p.user.includes('MEETING_BOOKED'));
    assert('personPrompt backlinks to company', p.user.includes(companyIndexPath('Acme Corp')));
    assert('personPrompt lists calls', p.user.includes('Intro with Alice'));
  }

  // callPrompt
  {
    const p = callPrompt(callCtx);
    assert('callPrompt mentions call title', p.user.includes('ROI followup with Alice'));
    assert('callPrompt backlinks to company', p.user.includes(companyIndexPath('Acme Corp')));
    assert('callPrompt backlinks to person', p.user.includes(personPath('Acme Corp', lead1.id, 'Alice Anderson')));
    assert('callPrompt lists prior calls', p.user.includes('Intro with Alice'));
    assert('callPrompt includes structured notes', p.user.includes('Summary: ROI analysis'));
  }

  // projectIndexPrompt
  {
    const p = projectIndexPrompt(projectCtx);
    assert('projectIndexPrompt mentions project name', p.user.includes('Stress Test Project'));
    assert('projectIndexPrompt lists companies', p.user.includes('Acme Corp') && p.user.includes('Globex Inc'));
    assert('projectIndexPrompt mentions lead count', p.user.includes('Total leads: 3'));
    assert('projectIndexPrompt mentions call count', p.user.includes('Total calls: 3'));
    assert('projectIndexPrompt references fixed topics', p.user.includes('objections'));
  }

  // topicPrompt
  {
    const p = topicPrompt(topicCtx);
    assert('topicPrompt mentions topic key', p.user.includes('objections'));
    assert('topicPrompt has matching excerpts', p.user.includes('Matching excerpts'));
    assert(
      'topicPrompt includes call backlinks',
      p.user.includes(callPath('Acme Corp', call1.id, call1.callDate, call1.title)),
    );
  }

  // topicDiscoveryPrompt
  {
    const p = topicDiscoveryPrompt([
      { path: 'companies/acme/index.md', title: 'Acme Corp' },
      { path: '_objections.md', title: 'Objections' },
    ]);
    assert('topicDiscoveryPrompt requires JSON output', p.system.includes('JSON'));
    assert('topicDiscoveryPrompt lists existing pages', p.user.includes('Acme Corp'));
    assert('topicDiscoveryPrompt mentions kebab-case', p.user.includes('kebab-case'));
  }

  // ========== TEST GROUP 3: compile.ts ==========
  section('3. Compile Orchestrator');

  // Stub generator that records calls
  type Call = { method: string; args: unknown[] };
  const createStubRegistry = (): { registry: GeneratorRegistry; calls: Call[] } => {
    const calls: Call[] = [];
    const fakeResult = (path: string): WriteDocResult => ({
      doc: {
        id: 'fake-' + Math.random().toString(36).slice(2),
        projectId: project.id,
        path,
        kind: 'COMPANY',
        version: 1,
        frontmatter: {} as any,
        content: '',
        contentHash: 'hash',
        sources: [] as any,
        supersededById: null,
        generatedAt: new Date(),
        createdAt: new Date(),
      },
      created: true,
      versionBumped: false,
    });
    const registry: GeneratorRegistry = {
      async generateCompany(_p, name) {
        calls.push({ method: 'company', args: [name] });
        return fakeResult(companyIndexPath(name));
      },
      async generatePerson(_p, leadId) {
        calls.push({ method: 'person', args: [leadId] });
        const l = await prisma.lead.findUnique({ where: { id: leadId } });
        return fakeResult(personPath(l!.company, l!.id, `${l!.firstName} ${l!.lastName}`));
      },
      async generateCall(_p, callId) {
        calls.push({ method: 'call', args: [callId] });
        const c = await prisma.call.findUnique({ where: { id: callId }, include: { lead: true } });
        return fakeResult(callPath(c!.lead.company, c!.id, c!.callDate, c!.title));
      },
      async generateProjectIndex(_p) {
        calls.push({ method: 'projectIndex', args: [] });
        return fakeResult(projectIndexPath());
      },
      async generateTopic(_p, topicKey) {
        calls.push({ method: 'topic', args: [topicKey] });
        return fakeResult(topicPath(topicKey));
      },
    };
    return { registry, calls };
  };

  // Scope: call — the main incremental path
  {
    const { registry, calls } = createStubRegistry();
    const result = await compileProject(project.id, { kind: 'call', callId: call1.id }, registry);
    const methods = calls.map((c) => c.method);
    assert('call scope calls generateCall', methods.includes('call'));
    assert('call scope calls generatePerson', methods.includes('person'));
    assert('call scope calls generateCompany', methods.includes('company'));
    assert('call scope calls generateProjectIndex', methods.includes('projectIndex'));
    // call1 has price/budget/competitor/icp keywords → topics should fire
    assert('call scope fires topics based on keywords', methods.includes('topic'));
    assert('No errors in compile result', result.errors.length === 0, JSON.stringify(result.errors));
    assert('All tasks marked as written (no priors)', result.written.length >= 4);
  }

  // Scope: lead
  {
    const { registry, calls } = createStubRegistry();
    const result = await compileProject(project.id, { kind: 'lead', leadId: lead1.id }, registry);
    const methods = calls.map((c) => c.method);
    assert('lead scope calls generatePerson', methods.includes('person'));
    assert('lead scope calls generateCompany', methods.includes('company'));
    assert('lead scope calls generateProjectIndex', methods.includes('projectIndex'));
    assert('lead scope does NOT call generateCall', !methods.includes('call'));
    assert('lead scope no errors', result.errors.length === 0);
  }

  // Scope: company
  {
    const { registry, calls } = createStubRegistry();
    const result = await compileProject(project.id, { kind: 'company', companyName: 'Acme Corp' }, registry);
    const methods = calls.map((c) => c.method);
    const personCalls = calls.filter((c) => c.method === 'person');
    const callCalls = calls.filter((c) => c.method === 'call');
    assert('company scope generates person for each lead', personCalls.length === 2);
    assert('company scope generates call for each call', callCalls.length === 2);
    assert('company scope generates the company index', methods.includes('company'));
    assert('company scope generates project index', methods.includes('projectIndex'));
    assert('company scope no errors', result.errors.length === 0);
  }

  // Scope: topic
  {
    const { registry, calls } = createStubRegistry();
    const result = await compileProject(project.id, { kind: 'topic', topicKey: 'objections' }, registry);
    assert('topic scope calls only generateTopic', calls.length === 1 && calls[0].method === 'topic');
    assert('topic scope no errors', result.errors.length === 0);
  }

  // Scope: all
  {
    const { registry, calls } = createStubRegistry();
    const result = await compileProject(project.id, { kind: 'all' }, registry);
    const methods = calls.map((c) => c.method);
    const personCalls = calls.filter((c) => c.method === 'person');
    const callCalls = calls.filter((c) => c.method === 'call');
    const companyCalls = calls.filter((c) => c.method === 'company');
    const topicCalls = calls.filter((c) => c.method === 'topic');
    assert('all scope generates every lead (3)', personCalls.length === 3);
    assert('all scope generates every call (3)', callCalls.length === 3);
    assert('all scope generates every company (2)', companyCalls.length === 2);
    assert('all scope fires 4 fixed topics', topicCalls.length === 4);
    assert('all scope generates project index', methods.includes('projectIndex'));
    assert('all scope no errors', result.errors.length === 0);
  }

  // Error resilience — a generator that throws
  {
    const throwing: GeneratorRegistry = {
      async generateCompany() { throw new Error('boom company'); },
      async generatePerson() { throw new Error('boom person'); },
      async generateCall() { throw new Error('boom call'); },
      async generateProjectIndex() { throw new Error('boom index'); },
      async generateTopic() { throw new Error('boom topic'); },
    };
    const result = await compileProject(project.id, { kind: 'call', callId: call1.id }, throwing);
    assert('Throwing generators produce errors (not crash)', result.errors.length > 0);
    assert('Each error has path + message', result.errors.every((e) => !!e.path && !!e.error));
    assert('Error path for company', result.errors.some((e) => e.error.includes('boom')));
  }

  // Dedup — same path only runs once
  {
    let companyCount = 0;
    const counting: GeneratorRegistry = {
      async generateCompany(_p, name) {
        companyCount++;
        return {
          doc: { id: 'x', projectId: project.id, path: companyIndexPath(name), kind: 'COMPANY', version: 1, frontmatter: {} as any, content: '', contentHash: 'h', sources: [] as any, supersededById: null, generatedAt: new Date(), createdAt: new Date() },
          created: true,
          versionBumped: false,
        };
      },
      async generatePerson() { return null as any; },
      async generateCall() { return null as any; },
      async generateProjectIndex() { return null as any; },
      async generateTopic() { return null as any; },
    };
    // Use company scope — will generate company once + projectIndex once
    // Then also person/call tasks which return null (that's fine for dedup test)
    // Just verify company was called exactly once despite being in task list
    await compileProject(project.id, { kind: 'company', companyName: 'Acme Corp' }, counting).catch(() => {});
    assert('Company generator called exactly once for company scope', companyCount === 1);
  }

  // Scope error — nonexistent call
  {
    const { registry } = createStubRegistry();
    try {
      await compileProject(project.id, { kind: 'call', callId: 'nonexistent' }, registry);
      assert('Nonexistent call scope should throw', false);
    } catch (e: any) {
      assert('Nonexistent call throws before dispatch', e.message.includes('not found'));
    }
  }

  // ========== TEST GROUP 4: topics.ts + topic.ts stub path ==========
  section('4. Topics module + topic generator stub path');

  // FIXED_TOPICS sanity
  {
    assert('FIXED_TOPICS has 4 entries', FIXED_TOPICS.length === 4);
    assert('FIXED_TOPICS includes objections', FIXED_TOPICS.includes('objections' as any));
    assert('FIXED_TOPICS includes competitors', FIXED_TOPICS.includes('competitors' as any));
    assert('FIXED_TOPICS includes icp-patterns', FIXED_TOPICS.includes('icp-patterns' as any));
    assert('FIXED_TOPICS includes pricing-feedback', FIXED_TOPICS.includes('pricing-feedback' as any));
  }

  // topic generator: empty-match short-circuit writes deterministic stub without LLM.
  // Use a topic key that won't match any structured notes in fixtures.
  {
    const result1 = await generateTopicDoc(project.id, 'unused-topic-key');
    assert('Empty-match topic created a doc', result1.created === true);
    assert('Empty-match topic wrote version 1', result1.doc.version === 1);
    assert('Empty-match topic content has stub marker',
      result1.doc.content.includes('No mentions yet'));
    assert('Empty-match topic has humanized title',
      result1.doc.content.includes('# Unused Topic Key'));
    assert('Empty-match topic kind = TOPIC', result1.doc.kind === 'TOPIC');

    // Rerunning should hit the contentHash skip path — no new version.
    const result2 = await generateTopicDoc(project.id, 'unused-topic-key');
    assert('Empty-match topic rerun is skipped (hash match)',
      result2.created === false && result2.versionBumped === false);
    assert('Empty-match topic rerun returned same version',
      result2.doc.version === 1);
  }

  // ========== TEST GROUP 5: Live LLM Compile (gated) ==========
  section('5. Live LLM Compile (gated by WIKI_TEST_LIVE=1)');

  if (process.env.WIKI_TEST_LIVE === '1') {
    const companyGen = await import('../src/lib/wiki/generators/company');
    const personGen = await import('../src/lib/wiki/generators/person');
    const callGen = await import('../src/lib/wiki/generators/call');
    const projectIndexGen = await import('../src/lib/wiki/generators/project-index');
    const topicGen = await import('../src/lib/wiki/generators/topic');
    const { discoverTopics } = await import('../src/lib/wiki/topics');

    const liveRegistry: GeneratorRegistry = {
      generateCompany: (pid, name) => companyGen.generate(pid, name),
      generatePerson: (pid, leadId) => personGen.generate(pid, leadId),
      generateCall: (pid, callId) => callGen.generate(pid, callId),
      generateProjectIndex: (pid) => projectIndexGen.generate(pid),
      generateTopic: (pid, topicKey) => topicGen.generate(pid, topicKey),
    };

    const result1 = await compileProject(
      project.id,
      { kind: 'call', callId: call1.id },
      liveRegistry,
    );

    assert('Live compile: no errors across all generators',
      result1.errors.length === 0, JSON.stringify(result1.errors));
    assert('Live compile wrote at least 4 pages',
      result1.written.length >= 4, `got ${result1.written.length}: ${result1.written.join(', ')}`);

    const callDocPath = callPath(lead1.company, call1.id, call1.callDate, call1.title);
    const callDoc = await prisma.wikiDocument.findFirst({
      where: { projectId: project.id, path: callDocPath, supersededById: null },
    });
    assert('Call wiki doc persisted', !!callDoc);
    assert('Call wiki doc has non-empty content', !!callDoc && callDoc.content.length > 50);
    assert('Call wiki doc kind = CALL', callDoc?.kind === 'CALL');

    const personDocPath = personPath(lead1.company, lead1.id, `${lead1.firstName} ${lead1.lastName}`);
    const personDoc = await prisma.wikiDocument.findFirst({
      where: { projectId: project.id, path: personDocPath, supersededById: null },
    });
    assert('Person wiki doc persisted', !!personDoc);
    assert('Person wiki doc has non-empty content', !!personDoc && personDoc.content.length > 50);

    const companyDocPath = companyIndexPath(lead1.company);
    const companyDoc = await prisma.wikiDocument.findFirst({
      where: { projectId: project.id, path: companyDocPath, supersededById: null },
    });
    assert('Company wiki doc persisted', !!companyDoc);
    assert('Company wiki doc has non-empty content', !!companyDoc && companyDoc.content.length > 50);

    const indexDoc = await prisma.wikiDocument.findFirst({
      where: { projectId: project.id, path: projectIndexPath(), supersededById: null },
    });
    assert('Project index doc persisted', !!indexDoc);
    assert('Project index doc has non-empty content',
      !!indexDoc && indexDoc.content.length > 50);
    assert('Project index doc kind = PROJECT_INDEX', indexDoc?.kind === 'PROJECT_INDEX');

    // At least one topic doc should exist — call1 has pricing/objection keywords so topics fire
    const topicDocs = await prisma.wikiDocument.findMany({
      where: { projectId: project.id, kind: 'TOPIC', supersededById: null },
    });
    assert('At least one topic doc persisted', topicDocs.length >= 1,
      `got ${topicDocs.length}`);

    // discoverTopics should return an array (possibly empty — depends on LLM)
    try {
      const discovered = await discoverTopics(project.id);
      assert('discoverTopics returned an array', Array.isArray(discovered));
      assert('discoverTopics entries have valid shape',
        discovered.every((t) => typeof t.key === 'string' && typeof t.title === 'string'));
    } catch (e: any) {
      // LLMs sometimes fail to produce strict JSON — log but don't hard-fail
      console.log(`  \x1b[33m⚠\x1b[0m discoverTopics threw: ${e.message}`);
    }

    // Second compile — LLM output is non-deterministic, so we only assert no errors
    const result2 = await compileProject(
      project.id,
      { kind: 'call', callId: call1.id },
      liveRegistry,
    );
    assert('Second live compile: no errors',
      result2.errors.length === 0, JSON.stringify(result2.errors));
  } else {
    console.log('  \x1b[33m⊘\x1b[0m skipped (set WIKI_TEST_LIVE=1 to run live LLM compile)');
  }

  // ========== TEST GROUP 6: Sub-task 6 API routes ==========
  section('6. API routes (compile + topics)');

  const compileRoute = await import('../src/app/api/wiki/compile/route');
  const topicsRoute = await import('../src/app/api/wiki/topics/route');

  // Create a sibling project with wikiEnabled=false for gating tests
  const noWikiProject = await prisma.project.create({
    data: { name: 'No Wiki Project', wikiEnabled: false },
  });

  const callRoute = (
    handler: (req: Request) => Promise<Response>,
    url: string,
    init?: RequestInit,
  ) => handler(new Request(url, init));

  // --- POST /api/wiki/compile ---
  {
    const res = await callRoute(compileRoute.POST, 'http://test/api/wiki/compile', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert('compile POST: 400 on missing projectId', res.status === 400);
  }
  {
    const res = await callRoute(compileRoute.POST, 'http://test/api/wiki/compile', {
      method: 'POST',
      body: JSON.stringify({ projectId: project.id }),
    });
    assert('compile POST: 400 on missing scope', res.status === 400);
  }
  {
    const res = await callRoute(compileRoute.POST, 'http://test/api/wiki/compile', {
      method: 'POST',
      body: JSON.stringify({ projectId: project.id, scope: { kind: 'bogus' } }),
    });
    assert('compile POST: 400 on invalid scope kind', res.status === 400);
  }
  {
    const res = await callRoute(compileRoute.POST, 'http://test/api/wiki/compile', {
      method: 'POST',
      body: JSON.stringify({ projectId: project.id, scope: { kind: 'company' } }),
    });
    assert('compile POST: 400 on company scope missing companyName', res.status === 400);
  }
  {
    const res = await callRoute(compileRoute.POST, 'http://test/api/wiki/compile', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'nonexistent-id', scope: { kind: 'all' } }),
    });
    assert('compile POST: 404 on nonexistent project', res.status === 404);
  }
  {
    const res = await callRoute(compileRoute.POST, 'http://test/api/wiki/compile', {
      method: 'POST',
      body: JSON.stringify({ projectId: noWikiProject.id, scope: { kind: 'all' } }),
    });
    assert('compile POST: 400 when wikiEnabled=false', res.status === 400);
  }

  // --- GET /api/wiki/topics ---
  {
    const res = await callRoute(topicsRoute.GET, 'http://test/api/wiki/topics');
    assert('topics GET: 400 on missing projectId', res.status === 400);
  }
  {
    const res = await callRoute(topicsRoute.GET, 'http://test/api/wiki/topics?projectId=nonexistent');
    assert('topics GET: 404 on nonexistent project', res.status === 404);
  }
  {
    const res = await callRoute(
      topicsRoute.GET,
      `http://test/api/wiki/topics?projectId=${noWikiProject.id}`,
    );
    assert('topics GET: 400 when wikiEnabled=false', res.status === 400);
  }

  // --- POST /api/wiki/topics ---
  {
    const res = await callRoute(topicsRoute.POST, 'http://test/api/wiki/topics', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert('topics POST: 400 on missing projectId', res.status === 400);
  }
  {
    const res = await callRoute(topicsRoute.POST, 'http://test/api/wiki/topics', {
      method: 'POST',
      body: JSON.stringify({ projectId: project.id }),
    });
    assert('topics POST: 400 on missing topicKey', res.status === 400);
  }
  {
    const res = await callRoute(topicsRoute.POST, 'http://test/api/wiki/topics', {
      method: 'POST',
      body: JSON.stringify({ projectId: noWikiProject.id, topicKey: 'foo' }),
    });
    assert('topics POST: 400 when wikiEnabled=false', res.status === 400);
  }
  {
    // Materialize a topic that has no matches → uses deterministic stub, no LLM call.
    const res = await callRoute(topicsRoute.POST, 'http://test/api/wiki/topics', {
      method: 'POST',
      body: JSON.stringify({ projectId: project.id, topicKey: 'sub6-empty-topic' }),
    });
    assert('topics POST: 200 on stub materialization', res.status === 200);
    const json: any = await res.json();
    assert('topics POST: response has doc', !!json.doc);
    assert('topics POST: doc kind = TOPIC', json.doc?.kind === 'TOPIC');
    assert(
      'topics POST: doc content has stub marker',
      typeof json.doc?.content === 'string' && json.doc.content.includes('No mentions yet'),
    );
  }

  // Cleanup the no-wiki sibling project (sub-task 6 fixtures only)
  await prisma.project.delete({ where: { id: noWikiProject.id } });

  // ========== TEST GROUP 7: Retrieval ==========
  section('7. Wiki retrieval (TF scoring)');

  // Seed 4 wiki docs in the fixture project with known content
  const seedDocs = [
    {
      path: 'companies/acme/index.md',
      kind: 'COMPANY' as const,
      title: 'Acme Corp',
      content: '# Acme Corp\n\nAcme Corp is a SaaS company. Their pricing is competitive.',
    },
    {
      path: 'companies/acme/people/alice-rt.md',
      kind: 'PERSON' as const,
      title: 'Alice Anderson',
      content: '# Alice Anderson\n\nAlice is the VP of Engineering at Acme.',
    },
    {
      path: 'companies/globex/index.md',
      kind: 'COMPANY' as const,
      title: 'Globex Inc',
      content: '# Globex Inc\n\nGlobex is a competitor that locked into a long contract.',
    },
    {
      path: '_objections.md',
      kind: 'TOPIC' as const,
      title: 'Objections',
      content: '# Objections\n\nPricing was a recurring objection. Several leads said the cost was too high.',
    },
  ];
  for (const d of seedDocs) {
    await prisma.wikiDocument.create({
      data: {
        projectId: project.id,
        path: d.path,
        kind: d.kind,
        version: 1,
        frontmatter: { title: d.title, backlinks: [] } as any,
        content: d.content,
        contentHash: 'rt-' + d.path,
        sources: [] as any,
      },
    });
  }

  // Title match dominates — querying "Acme" should rank Acme Corp first
  {
    const results = await retrieveRelevantDocs(project.id, 'Acme', 8);
    assert('Acme query returned results', results.length > 0);
    assert(
      'Acme query: top result is Acme Corp company page',
      results[0]?.doc.path === 'companies/acme/index.md',
      `top was ${results[0]?.doc.path}`,
    );
  }

  // Multi-token query — "pricing objection" should surface objections page
  {
    const results = await retrieveRelevantDocs(project.id, 'pricing objection', 8);
    assert('Pricing objection query returned results', results.length > 0);
    const topPath = results[0]?.doc.path;
    assert(
      'Pricing objection: objections topic ranks first',
      topPath === '_objections.md',
      `top was ${topPath}`,
    );
  }

  // Content-only match (no title hit) — "competitor" should surface Globex
  {
    const results = await retrieveRelevantDocs(project.id, 'competitor', 8);
    assert('Competitor query returned results', results.length > 0);
    const topPath = results[0]?.doc.path;
    assert(
      'Competitor query: Globex ranks first via content match',
      topPath === 'companies/globex/index.md',
      `top was ${topPath}`,
    );
  }

  // Empty query → empty results
  {
    const results = await retrieveRelevantDocs(project.id, '', 8);
    assert('Empty query returns no results', results.length === 0);
  }

  // Stopword-only query → empty results
  {
    const results = await retrieveRelevantDocs(project.id, 'the and is of', 8);
    assert('Stopword-only query returns no results', results.length === 0);
  }

  // Limit parameter is respected
  {
    const results = await retrieveRelevantDocs(project.id, 'Acme pricing competitor objection', 2);
    assert('Limit parameter caps results', results.length <= 2,
      `got ${results.length}`);
  }

  // No-match query → empty results
  {
    const results = await retrieveRelevantDocs(project.id, 'xyzzy nonexistent term', 8);
    assert('No-match query returns no results', results.length === 0);
  }

  // formatDocsForPrompt: empty input
  {
    const out = formatDocsForPrompt([]);
    assert('formatDocsForPrompt: empty input has fallback', out.includes('No relevant'));
  }

  // formatDocsForPrompt: truncation
  {
    const longDoc = await prisma.wikiDocument.create({
      data: {
        projectId: project.id,
        path: 'companies/longdoc.md',
        kind: 'COMPANY',
        version: 1,
        frontmatter: { title: 'LongDoc', backlinks: [] } as any,
        content: 'longword '.repeat(500),  // ~4500 chars
        contentHash: 'rt-long',
        sources: [] as any,
      },
    });
    const formatted = formatDocsForPrompt(
      [{ doc: longDoc, score: 1 }],
      100,
    );
    assert('formatDocsForPrompt: long content is truncated',
      formatted.includes('…') && formatted.length < 500);
  }

  // ========== TEST GROUP 8: Consistency Lint (Phase 2.1) ==========
  section('8. Consistency lint — fixture-stubbed');

  const lintProject = await prisma.project.create({
    data: { name: 'Lint Fixture Project', wikiEnabled: true },
  });

  const acmeCompanyPath = 'companies/lint-acme/index.md';
  const acmeCallPath1 = 'companies/lint-acme/calls/2026-03-10-intro.md';
  const acmeCallPath2 = 'companies/lint-acme/calls/2026-03-15-followup.md';

  // Seed COMPANY + 2 CALL docs that backlink to the company doc.
  // The two calls contradict each other on company size.
  await prisma.wikiDocument.create({
    data: {
      projectId: lintProject.id,
      path: acmeCompanyPath,
      kind: 'COMPANY',
      version: 1,
      frontmatter: { title: 'Lint Acme', backlinks: [] } as any,
      content: '# Lint Acme\n\nMid-market SaaS company.',
      contentHash: 'lint-acme-co',
      sources: [] as any,
    },
  });
  await prisma.wikiDocument.create({
    data: {
      projectId: lintProject.id,
      path: acmeCallPath1,
      kind: 'CALL',
      version: 1,
      frontmatter: { title: 'Intro call', backlinks: [acmeCompanyPath] } as any,
      content: '# Intro call\n\nThey told us the company has 50 employees and is bootstrapped.',
      contentHash: 'lint-acme-call1',
      sources: [] as any,
    },
  });
  await prisma.wikiDocument.create({
    data: {
      projectId: lintProject.id,
      path: acmeCallPath2,
      kind: 'CALL',
      version: 1,
      frontmatter: { title: 'Follow-up call', backlinks: [acmeCompanyPath] } as any,
      content: '# Follow-up call\n\nThe CTO mentioned they now have 200 employees and just raised a Series B.',
      contentHash: 'lint-acme-call2',
      sources: [] as any,
    },
  });

  // Stub LLM that returns one finding referencing both call paths.
  const stubFinding = {
    findings: [
      {
        severity: 'HIGH',
        title: 'Conflicting employee count for Lint Acme',
        description:
          'Two calls give incompatible headcount: 50 employees on the intro call vs 200 on the follow-up.',
        evidence: [
          { path: acmeCallPath1, quote: '50 employees' },
          { path: acmeCallPath2, quote: '200 employees' },
        ],
      },
    ],
  };
  const fixedLLM: LLMFn = async () => JSON.stringify(stubFinding);

  // First run — should create one finding.
  {
    const result = await runConsistencyLint(lintProject.id, fixedLLM);
    assert('Lint: scanned exactly 1 cluster', result.clustersScanned === 1,
      `got ${result.clustersScanned}`);
    assert('Lint: no clusters skipped', result.clustersSkipped === 0);
    assert('Lint: 1 finding created', result.findingsCreated === 1,
      `created=${result.findingsCreated}`);
    assert('Lint: 0 findings updated on first run', result.findingsUpdated === 0);
    assert('Lint: 1 LLM call', result.llmCalls === 1);
  }

  // DB shape check
  {
    const findings = await prisma.wikiLintFinding.findMany({
      where: { projectId: lintProject.id },
    });
    assert('Lint: exactly one row in DB', findings.length === 1);
    const f = findings[0];
    assert('Lint: severity persisted as HIGH', f?.severity === 'HIGH');
    assert('Lint: kind = INCONSISTENCY', f?.kind === 'INCONSISTENCY');
    assert('Lint: status defaults OPEN', f?.status === 'OPEN');
    const docPaths = f?.docPaths as string[];
    assert('Lint: docPaths contains both call paths',
      Array.isArray(docPaths) && docPaths.includes(acmeCallPath1) && docPaths.includes(acmeCallPath2));
    const evidence = f?.evidence as Array<{ path: string; version: number; quote: string }>;
    assert('Lint: evidence has version filled in from cluster',
      Array.isArray(evidence) && evidence.every((e) => e.version === 1));
  }

  // Second run with same stub — should update, not duplicate (fingerprint stable).
  {
    const result = await runConsistencyLint(lintProject.id, fixedLLM);
    assert('Lint: rerun creates 0 new findings', result.findingsCreated === 0,
      `created=${result.findingsCreated}`);
    assert('Lint: rerun updates the existing finding', result.findingsUpdated === 1,
      `updated=${result.findingsUpdated}`);
    const count = await prisma.wikiLintFinding.count({ where: { projectId: lintProject.id } });
    assert('Lint: still exactly one row after rerun', count === 1, `count=${count}`);
  }

  // Hallucinated path — finding referencing a path not in the cluster is dropped.
  {
    const halluLLM: LLMFn = async () =>
      JSON.stringify({
        findings: [
          {
            severity: 'MEDIUM',
            title: 'Bogus contradiction',
            description: 'This references a path the model invented.',
            evidence: [
              { path: acmeCallPath1, quote: '50 employees' },
              { path: 'companies/lint-acme/calls/imaginary.md', quote: 'made up' },
            ],
          },
        ],
      });
    const before = await prisma.wikiLintFinding.count({ where: { projectId: lintProject.id } });
    const result = await runConsistencyLint(lintProject.id, halluLLM);
    const after = await prisma.wikiLintFinding.count({ where: { projectId: lintProject.id } });
    assert('Lint: hallucinated finding dropped (no new row)', after === before);
    assert('Lint: hallucinated finding not counted as created', result.findingsCreated === 0);
  }

  // Empty findings array → no rows created
  {
    const emptyProj = await prisma.project.create({
      data: { name: 'Lint Empty Cluster', wikiEnabled: true },
    });
    const cPath = 'companies/empty-co/index.md';
    const callP = 'companies/empty-co/calls/c1.md';
    await prisma.wikiDocument.create({
      data: {
        projectId: emptyProj.id,
        path: cPath,
        kind: 'COMPANY',
        version: 1,
        frontmatter: { title: 'Empty Co', backlinks: [] } as any,
        content: '# Empty Co',
        contentHash: 'empty-co',
        sources: [] as any,
      },
    });
    await prisma.wikiDocument.create({
      data: {
        projectId: emptyProj.id,
        path: callP,
        kind: 'CALL',
        version: 1,
        frontmatter: { title: 'c1', backlinks: [cPath] } as any,
        content: '# c1',
        contentHash: 'empty-co-c1',
        sources: [] as any,
      },
    });
    const emptyLLM: LLMFn = async () => JSON.stringify({ findings: [] });
    const result = await runConsistencyLint(emptyProj.id, emptyLLM);
    assert('Lint: empty findings array yields 0 rows', result.findingsCreated === 0);
    assert('Lint: empty findings still scans the cluster', result.clustersScanned === 1);
    await prisma.project.delete({ where: { id: emptyProj.id } });
  }

  // Single-doc cluster → skipped, no LLM call
  {
    const soloProj = await prisma.project.create({
      data: { name: 'Lint Solo', wikiEnabled: true },
    });
    await prisma.wikiDocument.create({
      data: {
        projectId: soloProj.id,
        path: 'companies/solo/index.md',
        kind: 'COMPANY',
        version: 1,
        frontmatter: { title: 'Solo', backlinks: [] } as any,
        content: '# Solo',
        contentHash: 'solo-co',
        sources: [] as any,
      },
    });
    let calls = 0;
    const countingLLM: LLMFn = async () => {
      calls++;
      return '{"findings":[]}';
    };
    const result = await runConsistencyLint(soloProj.id, countingLLM);
    assert('Lint: solo cluster skipped (clustersScanned=0)', result.clustersScanned === 0);
    assert('Lint: solo cluster skipped (clustersSkipped=1)', result.clustersSkipped === 1);
    assert('Lint: solo cluster made 0 LLM calls', calls === 0);
    await prisma.project.delete({ where: { id: soloProj.id } });
  }

  // Empty project → 0 clusters scanned, 0 errors
  {
    const blankProj = await prisma.project.create({
      data: { name: 'Lint Blank', wikiEnabled: true },
    });
    const result = await runConsistencyLint(blankProj.id, fixedLLM);
    assert('Lint: empty project scans 0 clusters', result.clustersScanned === 0);
    assert('Lint: empty project creates 0 findings', result.findingsCreated === 0);
    await prisma.project.delete({ where: { id: blankProj.id } });
  }

  // Parser unit checks
  {
    const ok = parseFindings('```json\n{"findings":[{"severity":"LOW","title":"t","description":"d","evidence":[{"path":"a","quote":"q1"},{"path":"b","quote":"q2"}]}]}\n```');
    assert('parseFindings: strips fences', ok.length === 1 && ok[0].severity === 'LOW');

    const garbage = parseFindings('not json at all');
    assert('parseFindings: garbage → empty', garbage.length === 0);

    const tooFew = parseFindings('{"findings":[{"severity":"HIGH","title":"t","description":"d","evidence":[{"path":"a","quote":"q1"}]}]}');
    assert('parseFindings: <2 evidence dropped', tooFew.length === 0);

    const badSeverity = parseFindings('{"findings":[{"severity":"CATASTROPHIC","title":"t","description":"d","evidence":[{"path":"a","quote":"q1"},{"path":"b","quote":"q2"}]}]}');
    assert('parseFindings: invalid severity → MEDIUM default',
      badSeverity.length === 1 && badSeverity[0].severity === 'MEDIUM');
  }

  // Fingerprint stability
  {
    const f1 = fingerprintFinding('proj-x', {
      evidence: [
        { path: 'a', version: 1, quote: 'Hello World' },
        { path: 'b', version: 1, quote: 'Other' },
      ],
    });
    const f2 = fingerprintFinding('proj-x', {
      evidence: [
        { path: 'b', version: 1, quote: 'other' },
        { path: 'a', version: 1, quote: 'hello   world' },
      ],
    });
    assert('fingerprint: stable across order + case + whitespace', f1 === f2);

    const f3 = fingerprintFinding('proj-y', {
      evidence: [
        { path: 'a', version: 1, quote: 'Hello World' },
        { path: 'b', version: 1, quote: 'Other' },
      ],
    });
    assert('fingerprint: different project → different hash', f1 !== f3);
  }

  // Live LLM gated
  if (process.env.WIKI_TEST_LIVE === '1') {
    section('8b. Consistency lint — live LLM');
    const result = await runConsistencyLint(lintProject.id);
    assert('Live lint: completes without throwing', true);
    assert('Live lint: at least scanned the seeded cluster', result.clustersScanned >= 1,
      `scanned=${result.clustersScanned}`);
    console.log(`  ℹ live result: ${JSON.stringify(result)}`);
  } else {
    console.log('  \x1b[33m⊘\x1b[0m live lint skipped (set WIKI_TEST_LIVE=1)');
  }

  await prisma.project.delete({ where: { id: lintProject.id } });

  // ========== TEST GROUP 9: Web Search Provider (Phase 2.2a) ==========
  section('9. Web search provider — unit-level');

  // Factory: default
  {
    const provider = getSearchProvider({});
    assert('search factory: default is duckduckgo', provider.name === 'duckduckgo');
  }

  // Factory: explicit duckduckgo
  {
    const provider = getSearchProvider({ WIKI_SEARCH_PROVIDER: 'DuckDuckGo' });
    assert('search factory: case-insensitive match', provider.name === 'duckduckgo');
  }

  // Factory: unknown kind throws
  {
    let threw = false;
    try {
      getSearchProvider({ WIKI_SEARCH_PROVIDER: 'bogus' });
    } catch (e: any) {
      threw = e.message.includes('bogus');
    }
    assert('search factory: unknown provider throws', threw);
  }

  // StubSearchProvider: records calls and returns seeded results
  {
    const stub = new StubSearchProvider([
      { title: 'Result 1', url: 'https://a.test', snippet: 's1' },
      { title: 'Result 2', url: 'https://b.test', snippet: 's2' },
    ]);
    const results = await stub.search('hello', { maxResults: 5 });
    assert('StubSearchProvider: returns seeded results', results.length === 2);
    assert('StubSearchProvider: recorded the call',
      stub.calls.length === 1 && stub.calls[0].query === 'hello' && stub.calls[0].maxResults === 5);
  }

  // StubSearchProvider: respects maxResults clamp
  {
    const many = Array.from({ length: 15 }, (_, i) => ({
      title: `R${i}`,
      url: `https://r${i}.test`,
      snippet: '',
    }));
    const stub = new StubSearchProvider(many);
    const results = await stub.search('q', { maxResults: 999 });
    assert('StubSearchProvider: caps at hard max 10', results.length === 10);
  }

  // unwrapDuckDuckGoUrl: uddg redirect
  {
    const wrapped = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath%3Fq%3D1&rut=abc';
    const unwrapped = unwrapDuckDuckGoUrl(wrapped);
    assert('unwrapDuckDuckGoUrl: decodes uddg param',
      unwrapped === 'https://example.com/path?q=1');
  }

  // unwrapDuckDuckGoUrl: protocol-relative fallback
  {
    const unwrapped = unwrapDuckDuckGoUrl('//example.com/direct');
    assert('unwrapDuckDuckGoUrl: adds https to protocol-relative',
      unwrapped === 'https://example.com/direct');
  }

  // unwrapDuckDuckGoUrl: direct URL pass-through
  {
    const unwrapped = unwrapDuckDuckGoUrl('https://already.test/path');
    assert('unwrapDuckDuckGoUrl: direct URL passes through',
      unwrapped === 'https://already.test/path');
  }

  // unwrapDuckDuckGoUrl: empty input
  {
    assert('unwrapDuckDuckGoUrl: empty input returns empty',
      unwrapDuckDuckGoUrl('') === '');
  }

  // parseDuckDuckGoHtml: extracts 2 results from fixture HTML
  {
    const fixture = `
<html><body>
<div class="result__body">
  <h2 class="result__title">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fanthropic.com&rut=x">Anthropic &amp; Claude</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fanthropic.com&rut=x">AI safety company &quot;Claude&quot; maker</a>
</div>
<div class="result__body">
  <h2 class="result__title">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FAnthropic&rut=y">Anthropic - Wikipedia</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FAnthropic&rut=y">Encyclopedia entry</a>
</div>
</body></html>`;
    const results = parseDuckDuckGoHtml(fixture);
    assert('parseDuckDuckGoHtml: extracts 2 results', results.length === 2,
      `got ${results.length}`);
    assert('parseDuckDuckGoHtml: first result title decoded',
      results[0]?.title === 'Anthropic & Claude');
    assert('parseDuckDuckGoHtml: first result url unwrapped',
      results[0]?.url === 'https://anthropic.com');
    assert('parseDuckDuckGoHtml: first result snippet decoded',
      results[0]?.snippet === 'AI safety company "Claude" maker');
    assert('parseDuckDuckGoHtml: second result wikipedia',
      results[1]?.url === 'https://en.wikipedia.org/wiki/Anthropic');
  }

  // parseDuckDuckGoHtml: drops DDG-hosted ad/tracker URLs
  {
    const adHtml = `
<a class="result__a" href="https://duckduckgo.com/y.js?ad_domain=spammy.ai&rut=x">Sponsored</a>
<a class="result__snippet" href="#">ad copy</a>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freal.example.com">Real result</a>
<a class="result__snippet" href="#">real snippet</a>`;
    const results = parseDuckDuckGoHtml(adHtml);
    assert('parseDuckDuckGoHtml: ad tracker URL dropped',
      results.length === 1 && results[0].url === 'https://real.example.com');
  }

  // parseDuckDuckGoHtml: empty / malformed input
  {
    assert('parseDuckDuckGoHtml: empty string → []', parseDuckDuckGoHtml('').length === 0);
    assert('parseDuckDuckGoHtml: no result blocks → []',
      parseDuckDuckGoHtml('<html><body>nothing here</body></html>').length === 0);
  }

  // DuckDuckGoProvider: empty query skips fetch
  {
    const provider = new DuckDuckGoProvider();
    const results = await provider.search('   ');
    assert('DuckDuckGoProvider: whitespace query returns [] without fetch',
      results.length === 0);
  }

  // Gated live test — best-effort smoke check. DDG rate-limits and returns
  // empty results under load, so we warn rather than hard-fail on an empty list.
  if (process.env.WIKI_TEST_LIVE === '1') {
    section('9b. Web search provider — live DDG');
    try {
      const provider = new DuckDuckGoProvider();
      const results = await provider.search('Anthropic Claude', { maxResults: 3 });
      if (results.length === 0) {
        console.log('  \x1b[33m⚠\x1b[0m live DDG returned 0 results (likely rate-limited)');
      } else {
        assert('Live DDG: results have http URLs',
          results.every((r) => r.url.startsWith('http')));
        assert('Live DDG: results have non-empty titles',
          results.every((r) => r.title.length > 0));
        assert('Live DDG: results are not DDG-hosted ads',
          results.every((r) => !/^https?:\/\/(?:[^/]+\.)?duckduckgo\.com\//.test(r.url)));
        console.log(`  ℹ live result sample: ${JSON.stringify(results[0])}`);
      }
    } catch (e: any) {
      console.log(`  \x1b[33m⚠\x1b[0m live DDG threw: ${e.message}`);
    }
  } else {
    console.log('  \x1b[33m⊘\x1b[0m live DDG skipped (set WIKI_TEST_LIVE=1)');
  }

  // ========== CLEANUP ==========
  section('Cleanup');
  await prisma.project.delete({ where: { id: project.id } });
  assert('Cleanup: fixture project deleted', true);

  // ========== SUMMARY ==========
  console.log('\n\x1b[1m============================\x1b[0m');
  console.log(`\x1b[32mPASSED: ${passed}/${passed + failed}\x1b[0m`);
  if (failed > 0) {
    console.log(`\x1b[31mFAILED: ${failed}\x1b[0m`);
    console.log('\nFailures:');
    errors.forEach((e) => console.log('  - ' + e));
  }
  console.log('\x1b[1m============================\x1b[0m');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  await prisma.$disconnect();
  process.exit(1);
});
