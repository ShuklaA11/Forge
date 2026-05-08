import { prisma } from '../db';
import { triageReply, type TriageResult } from './reply-triage';

export async function runTriageForTouchpoint(touchpointId: string): Promise<TriageResult> {
  const touchpoint = await prisma.touchpoint.findUnique({
    where: { id: touchpointId },
    include: {
      lead: { include: { project: true } },
    },
  });
  if (!touchpoint) throw new Error(`Touchpoint ${touchpointId} not found`);
  if (touchpoint.direction !== 'INBOUND') {
    throw new Error('Triage only runs on INBOUND touchpoints');
  }

  const triage = await triageReply(
    {
      channel: touchpoint.channel,
      subject: touchpoint.subject,
      body: touchpoint.body,
      notes: touchpoint.notes,
    },
    {
      firstName: touchpoint.lead.firstName,
      lastName: touchpoint.lead.lastName,
      company: touchpoint.lead.company,
      title: touchpoint.lead.title,
    },
    {
      name: touchpoint.lead.project.name,
      idea: touchpoint.lead.project.idea,
      approach: touchpoint.lead.project.approach,
    },
  );

  await prisma.touchpoint.update({
    where: { id: touchpointId },
    data: { aiTriage: triage as unknown as object },
  });

  return triage;
}

export function runTriageInBackground(touchpointId: string): void {
  runTriageForTouchpoint(touchpointId).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[reply-triage] failed for touchpoint ${touchpointId}: ${msg}`);
  });
}
