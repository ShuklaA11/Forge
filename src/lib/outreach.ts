import { prisma } from './db';
import type { OutreachSequence, SequenceStatus } from '@prisma/client';

export interface CreateSequenceInput {
  leadId: string;
  templateUsed?: string | null;
  maxSteps?: number;
  intervalDays?: number;
  startDate?: Date;
}

const DEFAULT_MAX_STEPS = 5;
const DEFAULT_INTERVAL_DAYS = 3;

export async function createSequence(
  input: CreateSequenceInput,
): Promise<OutreachSequence> {
  const startDate = input.startDate ?? new Date();
  return prisma.outreachSequence.create({
    data: {
      leadId: input.leadId,
      templateUsed: input.templateUsed ?? null,
      maxSteps: input.maxSteps ?? DEFAULT_MAX_STEPS,
      intervalDays: input.intervalDays ?? DEFAULT_INTERVAL_DAYS,
      currentStep: 1,
      nextTouchDate: startDate,
      status: 'ACTIVE',
    },
  });
}

export interface DueSequence {
  sequence: OutreachSequence;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
    title: string | null;
    email: string | null;
    priorityScore: number;
    currentStage: string;
    projectId: string;
  };
}

export async function getDueSequences(
  projectIds?: string[],
  asOf: Date = new Date(),
): Promise<DueSequence[]> {
  const sequences = await prisma.outreachSequence.findMany({
    where: {
      status: 'ACTIVE',
      nextTouchDate: { lte: asOf },
      ...(projectIds && projectIds.length > 0
        ? { lead: { projectId: { in: projectIds } } }
        : {}),
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          title: true,
          email: true,
          priorityScore: true,
          currentStage: true,
          projectId: true,
        },
      },
    },
    orderBy: [
      { nextTouchDate: 'asc' },
      { lead: { priorityScore: 'desc' } },
    ],
  });

  return sequences.map(({ lead, ...sequence }) => ({ sequence, lead }));
}

export async function updateSequenceStatus(
  id: string,
  status: SequenceStatus,
): Promise<OutreachSequence> {
  return prisma.outreachSequence.update({
    where: { id },
    data: { status },
  });
}

export async function deleteSequence(id: string): Promise<void> {
  await prisma.outreachSequence.delete({ where: { id } });
}
