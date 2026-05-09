import { z } from 'zod';
import type { PipelineStage } from '@prisma/client';
import { prisma } from '../db';
import { runAgent, type LLMCaller } from './runtime';
import { recordAgentRun } from './runs';

const STALL_DAYS = 7;
const UNTOUCHED_DAYS = 7;
const HIGH_SCORE_THRESHOLD = 60;
const DISTRIBUTION_LOOKBACK_DAYS = 7;

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface StalledLeadSignal {
  leadId: string;
  name: string;
  company: string;
  stage: PipelineStage;
  daysInStage: number;
}

export interface UntouchedHighScoreSignal {
  leadId: string;
  name: string;
  company: string;
  priorityScore: number;
  daysSinceLastTouch: number | null;
}

export interface StageDistributionDelta {
  stage: PipelineStage;
  current: number;
  prior: number;
  delta: number;
}

export interface PipelineSignals {
  totalLeads: number;
  stageDistribution: Array<{ stage: PipelineStage; count: number }>;
  distributionDelta: StageDistributionDelta[];
  stalledLeads: StalledLeadSignal[];
  untouchedHighScore: UntouchedHighScoreSignal[];
  outboundCount: number;
  replyRate: number;
  generatedAt: string;
}

const findingSchema = z.object({
  severity: z.enum(SEVERITIES),
  title: z.string().min(1),
  detail: z.string().min(1),
  suggestedAction: z.string().min(1),
});

const digestSchema = z.object({
  headline: z.string().min(1),
  findings: z.array(findingSchema),
});

export type HealthFinding = z.infer<typeof findingSchema>;
export type HealthDigest = z.infer<typeof digestSchema>;

export interface PipelineHealthInsight {
  digest: HealthDigest;
  signals: PipelineSignals;
}

export async function gatherPipelineSignals(projectId: string): Promise<PipelineSignals> {
  const now = new Date();
  const stallCutoff = daysAgo(now, STALL_DAYS);
  const distributionCutoff = daysAgo(now, DISTRIBUTION_LOOKBACK_DAYS);
  const touchCutoff = daysAgo(now, UNTOUCHED_DAYS);

  const leads = await prisma.lead.findMany({
    where: { projectId, status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      currentStage: true,
      priorityScore: true,
      stageHistory: {
        select: { stage: true, enteredAt: true, exitedAt: true },
        orderBy: { enteredAt: 'desc' },
      },
      touchpoints: {
        select: { sentAt: true, direction: true, gotReply: true },
        orderBy: { sentAt: 'desc' },
      },
    },
  });

  const stageDistribution = aggregateStages(leads.map((l) => l.currentStage));

  const priorStageCounts = aggregateStages(
    leads
      .map((l) => stageAt(l.stageHistory, distributionCutoff))
      .filter((s): s is PipelineStage => s !== null),
  );
  const distributionDelta = diffDistributions(stageDistribution, priorStageCounts);

  const stalledLeads: StalledLeadSignal[] = [];
  const untouchedHighScore: UntouchedHighScoreSignal[] = [];
  let outboundCount = 0;
  let replyCount = 0;

  for (const lead of leads) {
    const currentEntry = lead.stageHistory.find((s) => s.exitedAt === null);
    if (currentEntry && currentEntry.enteredAt <= stallCutoff) {
      stalledLeads.push({
        leadId: lead.id,
        name: `${lead.firstName} ${lead.lastName}`.trim(),
        company: lead.company,
        stage: lead.currentStage,
        daysInStage: daysBetween(currentEntry.enteredAt, now),
      });
    }

    const lastTouch = lead.touchpoints[0]?.sentAt ?? null;
    const stale = !lastTouch || lastTouch <= touchCutoff;
    if (lead.priorityScore >= HIGH_SCORE_THRESHOLD && stale) {
      untouchedHighScore.push({
        leadId: lead.id,
        name: `${lead.firstName} ${lead.lastName}`.trim(),
        company: lead.company,
        priorityScore: lead.priorityScore,
        daysSinceLastTouch: lastTouch ? daysBetween(lastTouch, now) : null,
      });
    }

    for (const tp of lead.touchpoints) {
      if (tp.direction === 'OUTBOUND') {
        outboundCount += 1;
        if (tp.gotReply) replyCount += 1;
      }
    }
  }

  const replyRate = outboundCount === 0 ? 0 : Math.round((replyCount / outboundCount) * 1000) / 1000;

  return {
    totalLeads: leads.length,
    stageDistribution,
    distributionDelta,
    stalledLeads: stalledLeads.sort((a, b) => b.daysInStage - a.daysInStage).slice(0, 20),
    untouchedHighScore: untouchedHighScore
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 20),
    outboundCount,
    replyRate,
    generatedAt: now.toISOString(),
  };
}

export function buildHealthPrompt(
  signals: PipelineSignals,
  project: { name: string; idea: string | null; approach: string | null },
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a sales operations analyst. Analyze pipeline health signals and produce a prioritized digest.

Return JSON only:
{"headline":"one line summary","findings":[{"severity":"low|medium|high","title":"short","detail":"1-3 sentences","suggestedAction":"what the rep should do"}]}

Rules:
- Sort findings by severity (high first).
- Cap at 5 findings; pick the highest-leverage ones.
- Ground every finding in the supplied signals — do not invent leads or numbers.
- "high" severity = stalled high-value leads, sharp drop in reply rate, or many untouched hot leads.
- Be specific: name companies/leads when pointing at examples.`;

  const userPrompt = `Project: ${project.name}
Idea: ${project.idea ?? 'n/a'}
Approach: ${project.approach ?? 'n/a'}

Signals (JSON):
${JSON.stringify(signals, null, 2)}`;

  return { systemPrompt, userPrompt };
}

export function parseHealthDigest(
  raw: unknown,
):
  | { ok: true; value: HealthDigest }
  | { ok: false; error: string } {
  const result = digestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: issues };
  }
  const sorted = {
    ...result.data,
    findings: [...result.data.findings].sort(
      (a, b) => severityWeight(b.severity) - severityWeight(a.severity),
    ),
  };
  return { ok: true, value: sorted };
}

export async function runPipelineHealth(
  projectId: string,
  llm?: LLMCaller,
): Promise<PipelineHealthInsight> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, idea: true, approach: true },
  });
  if (!project) throw new Error(`Project ${projectId} not found`);

  const recorded = await recordAgentRun({
    agent: 'pipeline-health',
    projectId,
    fn: async () => {
      const signals = await gatherPipelineSignals(projectId);
      const { systemPrompt, userPrompt } = buildHealthPrompt(signals, project);

      const digest = await runAgent({
        name: 'pipeline-health',
        systemPrompt,
        userPrompt,
        schema: digestSchema,
        maxTokens: 1536,
        llm,
      });

      const sorted: HealthDigest = {
        ...digest,
        findings: [...digest.findings].sort(
          (a, b) => severityWeight(b.severity) - severityWeight(a.severity),
        ),
      };

      const insight: PipelineHealthInsight = { digest: sorted, signals };

      await prisma.projectInsight.create({
        data: {
          projectId,
          kind: 'PIPELINE_HEALTH',
          status: 'PROPOSED',
          content: insight as unknown as object,
        },
      });

      return {
        value: insight,
        summary: sorted.headline.slice(0, 500),
      };
    },
  });

  if (recorded.error || !recorded.value) {
    throw recorded.error ?? new Error('pipeline-health run produced no value');
  }
  return recorded.value;
}

function severityWeight(s: Severity): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

function daysAgo(now: Date, days: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function aggregateStages(stages: PipelineStage[]): Array<{ stage: PipelineStage; count: number }> {
  const counts = new Map<PipelineStage, number>();
  for (const s of stages) counts.set(s, (counts.get(s) ?? 0) + 1);
  return Array.from(counts.entries()).map(([stage, count]) => ({ stage, count }));
}

function diffDistributions(
  current: Array<{ stage: PipelineStage; count: number }>,
  prior: Array<{ stage: PipelineStage; count: number }>,
): StageDistributionDelta[] {
  const priorMap = new Map(prior.map((p) => [p.stage, p.count]));
  const currentMap = new Map(current.map((c) => [c.stage, c.count]));
  const stages = new Set<PipelineStage>([...priorMap.keys(), ...currentMap.keys()]);
  return Array.from(stages).map((stage) => {
    const c = currentMap.get(stage) ?? 0;
    const p = priorMap.get(stage) ?? 0;
    return { stage, current: c, prior: p, delta: c - p };
  });
}

function stageAt(
  history: Array<{ stage: PipelineStage; enteredAt: Date; exitedAt: Date | null }>,
  at: Date,
): PipelineStage | null {
  for (const entry of history) {
    if (entry.enteredAt <= at && (entry.exitedAt === null || entry.exitedAt > at)) {
      return entry.stage;
    }
  }
  return null;
}
