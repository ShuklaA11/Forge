import { Lead, Touchpoint, OutreachSequence } from '@prisma/client';

interface ScoringInput {
  lead: Lead;
  touchpoints: Touchpoint[];
  outreachSequence: OutreachSequence | null;
}

export function calculatePriorityScore(input: ScoringInput): number {
  const { lead, touchpoints, outreachSequence } = input;

  const weights = {
    engagementRecency: 0.30,
    pipelineStage: 0.25,
    decisionMakerLevel: 0.15,
    companySize: 0.10,
    followUpUrgency: 0.10,
    channelResponsiveness: 0.10,
  };

  const scores = {
    engagementRecency: scoreEngagementRecency(touchpoints),
    pipelineStage: scorePipelineStage(lead.currentStage),
    decisionMakerLevel: scoreDecisionMakerLevel(lead.role),
    companySize: scoreCompanySize(lead.companySize),
    followUpUrgency: scoreFollowUpUrgency(outreachSequence),
    channelResponsiveness: scoreChannelResponsiveness(touchpoints),
  };

  const totalScore = Object.entries(weights).reduce((total, [key, weight]) => {
    return total + (scores[key as keyof typeof scores] * weight);
  }, 0);

  return Math.round(totalScore);
}

function scoreEngagementRecency(touchpoints: Touchpoint[]): number {
  const replies = touchpoints
    .filter(t => t.direction === 'INBOUND' || t.gotReply)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  if (replies.length === 0) return 0;

  const lastReplyDate = new Date(replies[0].sentAt);
  const daysSinceReply = Math.floor(
    (Date.now() - lastReplyDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceReply <= 3) return 100;
  if (daysSinceReply <= 7) return 70;
  if (daysSinceReply <= 14) return 40;
  return 10;
}

function scorePipelineStage(stage: string): number {
  const stageScores: Record<string, number> = {
    RESEARCHED: 10,
    CONTACTED: 30,
    RESPONDED: 60,
    MEETING_BOOKED: 80,
    PROPOSAL_SENT: 95,
    CLOSED_WON: 100,
    CLOSED_LOST: 0,
  };
  return stageScores[stage] ?? 0;
}

function scoreDecisionMakerLevel(role: string): number {
  const roleScores: Record<string, number> = {
    C_SUITE: 100,
    VP: 75,
    DIRECTOR: 50,
    MANAGER: 25,
    OTHER: 10,
  };
  return roleScores[role] ?? 10;
}

function scoreCompanySize(size: string | null): number {
  if (!size) return 25;
  const sizeScores: Record<string, number> = {
    SIZE_200_PLUS: 100,
    SIZE_51_200: 75,
    SIZE_11_50: 50,
    SIZE_1_10: 25,
  };
  return sizeScores[size] ?? 25;
}

function scoreFollowUpUrgency(sequence: OutreachSequence | null): number {
  if (!sequence || !sequence.nextTouchDate || sequence.status !== 'ACTIVE') return 20;

  const now = new Date();
  const nextTouch = new Date(sequence.nextTouchDate);
  const daysUntilDue = Math.floor(
    (nextTouch.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilDue < -3) return 100;
  if (daysUntilDue < 0) return 80;
  if (daysUntilDue === 0) return 60;
  if (daysUntilDue <= 2) return 50;
  return 20;
}

function scoreChannelResponsiveness(touchpoints: Touchpoint[]): number {
  const hasReply = touchpoints.some(t => t.direction === 'INBOUND' || t.gotReply);
  if (hasReply) return 100;

  const hasOutbound = touchpoints.some(t => t.direction === 'OUTBOUND');
  if (hasOutbound) return 25;

  return 0;
}
