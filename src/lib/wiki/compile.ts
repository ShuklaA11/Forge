import { prisma } from '../db';
import type { WriteDocResult } from './store';
import {
  companyIndexPath,
  personPath,
  callPath,
  topicPath,
  projectIndexPath,
} from './paths';
import { FIXED_TOPICS } from './topics';

export type CompileScope =
  | { kind: 'all' }
  | { kind: 'company'; companyName: string }
  | { kind: 'lead'; leadId: string }
  | { kind: 'call'; callId: string }
  | { kind: 'topic'; topicKey: string };

export interface GeneratorRegistry {
  generateCompany(projectId: string, companyName: string): Promise<WriteDocResult>;
  generatePerson(projectId: string, leadId: string): Promise<WriteDocResult>;
  generateCall(projectId: string, callId: string): Promise<WriteDocResult>;
  generateProjectIndex(projectId: string): Promise<WriteDocResult>;
  generateTopic(projectId: string, topicKey: string): Promise<WriteDocResult>;
}

export interface CompileResult {
  written: string[];
  skipped: string[];
  versioned: string[];
  errors: Array<{ path: string; error: string }>;
}

interface CompileTask {
  path: string;
  run: () => Promise<WriteDocResult>;
}

export async function compileProject(
  projectId: string,
  scope: CompileScope,
  generators: GeneratorRegistry,
): Promise<CompileResult> {
  const tasks = await resolveTasks(projectId, scope, generators);
  return runTasks(tasks);
}

async function resolveTasks(
  projectId: string,
  scope: CompileScope,
  generators: GeneratorRegistry,
): Promise<CompileTask[]> {
  switch (scope.kind) {
    case 'call':
      return resolveCallScope(projectId, scope.callId, generators);
    case 'lead':
      return resolveLeadScope(projectId, scope.leadId, generators);
    case 'company':
      return resolveCompanyScope(projectId, scope.companyName, generators);
    case 'topic':
      return [
        {
          path: topicPath(scope.topicKey),
          run: () => generators.generateTopic(projectId, scope.topicKey),
        },
      ];
    case 'all':
      return resolveAllScope(projectId, generators);
  }
}

async function resolveCallScope(
  projectId: string,
  callId: string,
  generators: GeneratorRegistry,
): Promise<CompileTask[]> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { lead: true },
  });
  if (!call) throw new Error(`Call ${callId} not found`);
  if (call.lead.projectId !== projectId) {
    throw new Error(`Call ${callId} does not belong to project ${projectId}`);
  }

  const lead = call.lead;
  const tasks: CompileTask[] = [
    {
      path: callPath(lead.company, call.id, call.callDate, call.title),
      run: () => generators.generateCall(projectId, call.id),
    },
    {
      path: personPath(lead.company, lead.id, `${lead.firstName} ${lead.lastName}`),
      run: () => generators.generatePerson(projectId, lead.id),
    },
    {
      path: companyIndexPath(lead.company),
      run: () => generators.generateCompany(projectId, lead.company),
    },
  ];

  const relevantTopics = detectRelevantTopics(call.structuredNotes);
  for (const topicKey of relevantTopics) {
    tasks.push({
      path: topicPath(topicKey),
      run: () => generators.generateTopic(projectId, topicKey),
    });
  }

  tasks.push({
    path: projectIndexPath(),
    run: () => generators.generateProjectIndex(projectId),
  });

  return tasks;
}

async function resolveLeadScope(
  projectId: string,
  leadId: string,
  generators: GeneratorRegistry,
): Promise<CompileTask[]> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.projectId !== projectId) {
    throw new Error(`Lead ${leadId} does not belong to project ${projectId}`);
  }

  return [
    {
      path: personPath(lead.company, lead.id, `${lead.firstName} ${lead.lastName}`),
      run: () => generators.generatePerson(projectId, lead.id),
    },
    {
      path: companyIndexPath(lead.company),
      run: () => generators.generateCompany(projectId, lead.company),
    },
    {
      path: projectIndexPath(),
      run: () => generators.generateProjectIndex(projectId),
    },
  ];
}

async function resolveCompanyScope(
  projectId: string,
  companyName: string,
  generators: GeneratorRegistry,
): Promise<CompileTask[]> {
  const leads = await prisma.lead.findMany({
    where: { projectId, company: companyName },
    include: { calls: { select: { id: true, callDate: true, title: true } } },
  });

  const tasks: CompileTask[] = [];

  for (const lead of leads) {
    tasks.push({
      path: personPath(companyName, lead.id, `${lead.firstName} ${lead.lastName}`),
      run: () => generators.generatePerson(projectId, lead.id),
    });
    for (const call of lead.calls) {
      tasks.push({
        path: callPath(companyName, call.id, call.callDate, call.title),
        run: () => generators.generateCall(projectId, call.id),
      });
    }
  }

  tasks.push({
    path: companyIndexPath(companyName),
    run: () => generators.generateCompany(projectId, companyName),
  });
  tasks.push({
    path: projectIndexPath(),
    run: () => generators.generateProjectIndex(projectId),
  });

  return tasks;
}

async function resolveAllScope(
  projectId: string,
  generators: GeneratorRegistry,
): Promise<CompileTask[]> {
  const leads = await prisma.lead.findMany({
    where: { projectId },
    include: { calls: { select: { id: true, callDate: true, title: true, structuredNotes: true } } },
  });

  const tasks: CompileTask[] = [];
  const seenCompanies = new Set<string>();

  for (const lead of leads) {
    tasks.push({
      path: personPath(lead.company, lead.id, `${lead.firstName} ${lead.lastName}`),
      run: () => generators.generatePerson(projectId, lead.id),
    });
    for (const call of lead.calls) {
      tasks.push({
        path: callPath(lead.company, call.id, call.callDate, call.title),
        run: () => generators.generateCall(projectId, call.id),
      });
    }
    if (!seenCompanies.has(lead.company)) {
      seenCompanies.add(lead.company);
      tasks.push({
        path: companyIndexPath(lead.company),
        run: () => generators.generateCompany(projectId, lead.company),
      });
    }
  }

  for (const topicKey of FIXED_TOPICS) {
    tasks.push({
      path: topicPath(topicKey),
      run: () => generators.generateTopic(projectId, topicKey),
    });
  }

  tasks.push({
    path: projectIndexPath(),
    run: () => generators.generateProjectIndex(projectId),
  });

  return tasks;
}

async function runTasks(tasks: CompileTask[]): Promise<CompileResult> {
  const result: CompileResult = { written: [], skipped: [], versioned: [], errors: [] };
  const seen = new Set<string>();

  for (const task of tasks) {
    if (seen.has(task.path)) continue;
    seen.add(task.path);

    try {
      const r = await task.run();
      if (r.versionBumped) {
        result.versioned.push(task.path);
      } else if (r.created) {
        result.written.push(task.path);
      } else {
        result.skipped.push(task.path);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ path: task.path, error: message });
    }
  }

  return result;
}

function detectRelevantTopics(structuredNotes: unknown): string[] {
  if (!structuredNotes || typeof structuredNotes !== 'object') return [];
  const notes = structuredNotes as Record<string, unknown>;

  const topics: string[] = [];

  const hasNonEmpty = (field: string): boolean => {
    const v = notes[field];
    return Array.isArray(v) && v.length > 0;
  };

  if (hasNonEmpty('objections')) topics.push('objections');

  const textFields = ['keyPoints', 'quotes', 'objections'];
  const allText = textFields
    .flatMap((f) => (Array.isArray(notes[f]) ? (notes[f] as unknown[]) : []))
    .filter((x): x is string => typeof x === 'string')
    .join(' ')
    .toLowerCase();

  const keywordTopics: Record<string, string[]> = {
    competitors: ['competitor', 'alternative', ' vs ', 'compared to', 'instead of'],
    'pricing-feedback': ['price', 'cost', 'pricing', 'budget', 'expensive', 'cheap', 'afford'],
    'icp-patterns': ['ideal', 'use case', 'fit for us', 'problem we'],
  };

  for (const [topic, kws] of Object.entries(keywordTopics)) {
    if (kws.some((kw) => allText.includes(kw))) topics.push(topic);
  }

  return topics;
}

