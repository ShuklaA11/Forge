import { describe, expect, it, vi } from 'vitest';
import { recordAgentRun, listRecentRuns, type AgentRunPrisma } from './runs';
import type { AgentRun, Prisma } from '@prisma/client';

function makeStub() {
  let nextId = 1;
  const rows = new Map<string, AgentRun>();

  const create = vi.fn(async ({ data }: { data: Prisma.AgentRunUncheckedCreateInput }) => {
    const id = `run_${nextId++}`;
    const row: AgentRun = {
      id,
      agent: data.agent,
      projectId: (data.projectId as string | null | undefined) ?? null,
      leadId: (data.leadId as string | null | undefined) ?? null,
      startedAt: new Date(),
      finishedAt: null,
      success: false,
      tokensIn: 0,
      tokensOut: 0,
      summary: null,
      error: null,
    };
    rows.set(id, row);
    return row;
  });

  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Prisma.AgentRunUncheckedUpdateInput;
    }) => {
      const existing = rows.get(where.id);
      if (!existing) throw new Error(`row ${where.id} not found`);
      const merged = { ...existing, ...(data as Partial<AgentRun>) };
      rows.set(where.id, merged);
      return merged;
    },
  );

  const findMany = vi.fn(async () => Array.from(rows.values()));

  const stub: AgentRunPrisma & { rows: Map<string, AgentRun> } = {
    create,
    update,
    findMany,
    rows,
  };
  return stub;
}

describe('recordAgentRun', () => {
  it('records a successful run with tokens and summary', async () => {
    const stub = makeStub();
    const result = await recordAgentRun({
      agent: 'test-agent',
      projectId: 'p1',
      prisma: stub,
      fn: async () => ({ value: { hello: 'world' }, summary: 'ok', tokensIn: 5, tokensOut: 7 }),
    });

    expect(result.error).toBeNull();
    expect(result.value).toEqual({ hello: 'world' });
    expect(result.run.success).toBe(true);
    expect(result.run.tokensIn).toBe(5);
    expect(result.run.tokensOut).toBe(7);
    expect(result.run.summary).toBe('ok');
    expect(result.run.finishedAt).toBeInstanceOf(Date);
    expect(stub.create).toHaveBeenCalledWith({
      data: { agent: 'test-agent', projectId: 'p1', leadId: null },
    });
  });

  it('records a failed run with the error message', async () => {
    const stub = makeStub();
    const boom = new Error('agent blew up');
    const result = await recordAgentRun({
      agent: 'test-agent',
      leadId: 'l1',
      prisma: stub,
      fn: async () => {
        throw boom;
      },
    });

    expect(result.value).toBeNull();
    expect(result.error).toBe(boom);
    expect(result.run.success).toBe(false);
    expect(result.run.error).toBe('agent blew up');
    expect(result.run.finishedAt).toBeInstanceOf(Date);
  });

  it('truncates very long error messages', async () => {
    const stub = makeStub();
    const result = await recordAgentRun({
      agent: 'test-agent',
      prisma: stub,
      fn: async () => {
        throw new Error('x'.repeat(5000));
      },
    });
    expect(result.run.error?.length).toBe(2000);
  });

  it('wraps non-Error throws', async () => {
    const stub = makeStub();
    const result = await recordAgentRun({
      agent: 'test-agent',
      prisma: stub,
      fn: async () => {
        throw 'string-shaped failure';
      },
    });
    expect(result.error?.message).toBe('string-shaped failure');
    expect(result.run.success).toBe(false);
  });
});

describe('listRecentRuns', () => {
  it('passes filters through to the prisma client', async () => {
    const stub = makeStub();
    await listRecentRuns({ projectId: 'p1', agent: 'pipeline-health', limit: 10, prisma: stub });
    expect(stub.findMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', agent: 'pipeline-health' },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
  });

  it('defaults to a limit of 50 with no filters', async () => {
    const stub = makeStub();
    await listRecentRuns({ prisma: stub });
    expect(stub.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  });
});
