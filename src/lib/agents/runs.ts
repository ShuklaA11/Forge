import { prisma } from '../db';
import type { AgentRun, Prisma } from '@prisma/client';

export interface AgentRunPrisma {
  create(args: { data: Prisma.AgentRunUncheckedCreateInput }): Promise<AgentRun>;
  update(args: {
    where: { id: string };
    data: Prisma.AgentRunUncheckedUpdateInput;
  }): Promise<AgentRun>;
  findMany(args: {
    where?: Prisma.AgentRunWhereInput;
    orderBy?: Prisma.AgentRunOrderByWithRelationInput;
    take?: number;
  }): Promise<AgentRun[]>;
}

export interface RecordAgentRunInput<T> {
  agent: string;
  projectId?: string | null;
  leadId?: string | null;
  fn: () => Promise<AgentRunResult<T>>;
  prisma?: AgentRunPrisma;
}

export interface AgentRunResult<T> {
  value: T;
  summary?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface RecordedAgentRun<T> {
  run: AgentRun;
  value: T | null;
  error: Error | null;
}

function client(override?: AgentRunPrisma): AgentRunPrisma {
  return override ?? (prisma.agentRun as unknown as AgentRunPrisma);
}

export async function recordAgentRun<T>(
  input: RecordAgentRunInput<T>,
): Promise<RecordedAgentRun<T>> {
  const db = client(input.prisma);
  const run = await db.create({
    data: {
      agent: input.agent,
      projectId: input.projectId ?? null,
      leadId: input.leadId ?? null,
    },
  });

  try {
    const result = await input.fn();
    const updated = await db.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        success: true,
        tokensIn: result.tokensIn ?? 0,
        tokensOut: result.tokensOut ?? 0,
        summary: result.summary ?? null,
      },
    });
    return { run: updated, value: result.value, error: null };
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    const updated = await db.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        success: false,
        error: err.message.slice(0, 2000),
      },
    });
    return { run: updated, value: null, error: err };
  }
}

export interface ListRecentRunsOptions {
  projectId?: string;
  leadId?: string;
  agent?: string;
  limit?: number;
  prisma?: AgentRunPrisma;
}

export async function listRecentRuns(opts: ListRecentRunsOptions = {}): Promise<AgentRun[]> {
  const db = client(opts.prisma);
  const where: Prisma.AgentRunWhereInput = {};
  if (opts.projectId) where.projectId = opts.projectId;
  if (opts.leadId) where.leadId = opts.leadId;
  if (opts.agent) where.agent = opts.agent;

  return db.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: opts.limit ?? 50,
  });
}
