import type {
  Project,
  Lead,
  Call,
  Touchpoint,
  LeadStageHistory,
  WikiRawSource,
} from '@prisma/client';
import { prisma } from '../db';

export interface CompanyContext {
  project: Project;
  companyName: string;
  leads: Lead[];
  calls: (Call & { lead: Pick<Lead, 'id' | 'firstName' | 'lastName'> })[];
  touchpoints: (Touchpoint & { lead: Pick<Lead, 'id' | 'firstName' | 'lastName'> })[];
  rawSources: WikiRawSource[];
}

export interface LeadContext {
  project: Project;
  lead: Lead;
  calls: Call[];
  touchpoints: Touchpoint[];
  stageHistory: LeadStageHistory[];
}

export interface CallContext {
  project: Project;
  call: Call;
  lead: Lead;
  priorCalls: Call[];
}

export interface ProjectContext {
  project: Project;
  companies: Array<{ name: string; leadCount: number; callCount: number }>;
  leadCount: number;
  callCount: number;
  rawSources: WikiRawSource[];
}

export interface TopicContext {
  project: Project;
  topicKey: string;
  matches: Array<{
    call: Call;
    lead: Pick<Lead, 'id' | 'firstName' | 'lastName' | 'company'>;
    matchedNotes: string[];
  }>;
}

async function getProjectOrThrow(projectId: string): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project ${projectId} not found`);
  return project;
}

function rawSourcesForCompany(sources: WikiRawSource[], companyName: string): WikiRawSource[] {
  const target = companyName.toLowerCase();
  return sources.filter((s) => {
    const meta = s.metadata as Record<string, unknown> | null;
    if (!meta) return false;
    const assoc = meta.companyName;
    return typeof assoc === 'string' && assoc.toLowerCase() === target;
  });
}

export async function buildCompanyContext(
  projectId: string,
  companyName: string,
): Promise<CompanyContext> {
  const project = await getProjectOrThrow(projectId);

  const leads = await prisma.lead.findMany({
    where: { projectId, company: companyName },
    orderBy: { priorityScore: 'desc' },
  });

  const leadIds = leads.map((l) => l.id);

  const [calls, touchpoints, allRawSources] = await Promise.all([
    prisma.call.findMany({
      where: { leadId: { in: leadIds } },
      include: { lead: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { callDate: 'desc' },
    }),
    prisma.touchpoint.findMany({
      where: { leadId: { in: leadIds } },
      include: { lead: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { sentAt: 'desc' },
    }),
    prisma.wikiRawSource.findMany({ where: { projectId } }),
  ]);

  return {
    project,
    companyName,
    leads,
    calls,
    touchpoints,
    rawSources: rawSourcesForCompany(allRawSources, companyName),
  };
}

export async function buildLeadContext(projectId: string, leadId: string): Promise<LeadContext> {
  const project = await getProjectOrThrow(projectId);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.projectId !== projectId) {
    throw new Error(`Lead ${leadId} does not belong to project ${projectId}`);
  }

  const [calls, touchpoints, stageHistory] = await Promise.all([
    prisma.call.findMany({ where: { leadId }, orderBy: { callDate: 'desc' } }),
    prisma.touchpoint.findMany({ where: { leadId }, orderBy: { sentAt: 'desc' } }),
    prisma.leadStageHistory.findMany({ where: { leadId }, orderBy: { enteredAt: 'asc' } }),
  ]);

  return { project, lead, calls, touchpoints, stageHistory };
}

export async function buildCallContext(projectId: string, callId: string): Promise<CallContext> {
  const project = await getProjectOrThrow(projectId);

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { lead: true },
  });
  if (!call) throw new Error(`Call ${callId} not found`);
  if (call.lead.projectId !== projectId) {
    throw new Error(`Call ${callId} does not belong to project ${projectId}`);
  }

  const priorCalls = await prisma.call.findMany({
    where: {
      leadId: call.leadId,
      callDate: { lt: call.callDate },
    },
    orderBy: { callDate: 'desc' },
    take: 10,
  });

  const { lead, ...callOnly } = call;
  return { project, call: callOnly as Call, lead, priorCalls };
}

export async function buildProjectContext(projectId: string): Promise<ProjectContext> {
  const project = await getProjectOrThrow(projectId);

  const leads = await prisma.lead.findMany({
    where: { projectId },
    select: { id: true, company: true },
  });

  const callCounts = await prisma.call.groupBy({
    by: ['leadId'],
    where: { leadId: { in: leads.map((l) => l.id) } },
    _count: { _all: true },
  });
  const leadCallCount = new Map<string, number>();
  callCounts.forEach((c) => leadCallCount.set(c.leadId, c._count._all));

  const companyMap = new Map<string, { leadCount: number; callCount: number }>();
  for (const lead of leads) {
    const existing = companyMap.get(lead.company) ?? { leadCount: 0, callCount: 0 };
    existing.leadCount += 1;
    existing.callCount += leadCallCount.get(lead.id) ?? 0;
    companyMap.set(lead.company, existing);
  }

  const companies = Array.from(companyMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.leadCount - a.leadCount);

  const [rawSources, totalCalls] = await Promise.all([
    prisma.wikiRawSource.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } }),
    prisma.call.count({ where: { lead: { projectId } } }),
  ]);

  return {
    project,
    companies,
    leadCount: leads.length,
    callCount: totalCalls,
    rawSources,
  };
}

export async function buildTopicContext(
  projectId: string,
  topicKey: string,
): Promise<TopicContext> {
  const project = await getProjectOrThrow(projectId);

  const calls = await prisma.call.findMany({
    where: { lead: { projectId } },
    include: { lead: { select: { id: true, firstName: true, lastName: true, company: true } } },
    orderBy: { callDate: 'desc' },
  });

  const matches = calls
    .map((call) => {
      const { lead, ...callOnly } = call;
      const matchedNotes = extractTopicMatches(callOnly.structuredNotes, topicKey);
      return { call: callOnly as Call, lead, matchedNotes };
    })
    .filter((m) => m.matchedNotes.length > 0);

  return { project, topicKey, matches };
}

function extractTopicMatches(structuredNotes: unknown, topicKey: string): string[] {
  if (!structuredNotes || typeof structuredNotes !== 'object') return [];
  const notes = structuredNotes as Record<string, unknown>;

  const topicMap: Record<string, string[]> = {
    objections: ['objections'],
    competitors: ['keyPoints', 'quotes'],
    'icp-patterns': ['validationSignals', 'keyPoints'],
    'pricing-feedback': ['objections', 'quotes', 'keyPoints'],
  };

  const relevantFields = topicMap[topicKey] ?? ['keyPoints', 'quotes', 'objections'];
  const keywordsByTopic: Record<string, string[]> = {
    objections: ['object', 'concern', 'worry', 'hesit', 'risk', 'expensive', 'budget'],
    competitors: ['competitor', 'alternative', 'vs', 'compared to', 'instead'],
    'icp-patterns': ['fit', 'ideal', 'use case', 'problem', 'need'],
    'pricing-feedback': ['price', 'cost', 'pricing', 'budget', 'expensive', 'cheap', 'affordable'],
  };

  const keywords = keywordsByTopic[topicKey] ?? [topicKey.toLowerCase()];
  const matched: string[] = [];

  for (const field of relevantFields) {
    const value = notes[field];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const lower = item.toLowerCase();
        if (keywords.some((k) => lower.includes(k))) matched.push(item);
      }
    }
  }

  return matched;
}
