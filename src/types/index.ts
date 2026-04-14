export type {
  Project,
  Lead,
  LeadStageHistory,
  Touchpoint,
  OutreachSequence,
  ResearchSession,
  Settings,
  Call,
  CallAnnotation,
  CompanySummary,
  ProjectSummary,
  WikiDocument,
  WikiRawSource,
} from '@prisma/client';

export type {
  ProjectStatus,
  LeadStatus,
  CompanySize,
  CompanyType,
  LeadSource,
  DecisionMakerRole,
  PipelineStage,
  Channel,
  TouchpointDirection,
  TouchpointType,
  SequenceStatus,
  ResearchStatus,
  ProjectCampaignStage,
  ConversationStage,
  CallSentiment,
  WikiDocumentKind,
  WikiRawSourceKind,
} from '@prisma/client';

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  RESEARCHED: 'Researched',
  CONTACTED: 'Contacted',
  RESPONDED: 'Responded',
  MEETING_BOOKED: 'Meeting Booked',
  PROPOSAL_SENT: 'Proposal Sent',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

export const PIPELINE_STAGES_ORDERED = [
  'RESEARCHED',
  'CONTACTED',
  'RESPONDED',
  'MEETING_BOOKED',
  'PROPOSAL_SENT',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const;

export const COMPANY_SIZE_LABELS: Record<string, string> = {
  SIZE_1_10: '1-10',
  SIZE_11_50: '11-50',
  SIZE_51_200: '51-200',
  SIZE_200_PLUS: '200+',
};

export const COMPANY_TYPE_LABELS: Record<string, string> = {
  SMB: 'SMB',
  BANK: 'Bank',
};

export const DECISION_MAKER_LABELS: Record<string, string> = {
  C_SUITE: 'C-Suite / Owner',
  VP: 'VP',
  DIRECTOR: 'Director',
  MANAGER: 'Manager',
  OTHER: 'Other',
};

export const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  PHONE: 'Phone',
  OTHER: 'Other',
};

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  REFERRAL: 'Referral',
  LINKEDIN: 'LinkedIn',
  WEBSITE: 'Website',
  AI_RESEARCH: 'AI Research',
  OTHER: 'Other',
};

export const PROJECT_CAMPAIGN_STAGE_LABELS: Record<string, string> = {
  IDEATION: 'Ideation',
  PLANNING: 'Planning',
  ACTIVE: 'Active Outreach',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
};

export const PROJECT_CAMPAIGN_STAGES_ORDERED = [
  'IDEATION',
  'PLANNING',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
] as const;

export const CONVERSATION_STAGE_LABELS: Record<string, string> = {
  LEAD: 'Lead',
  INTRO_CALL: 'Intro Call',
  DEMO: 'Demo',
  PILOT: 'Pilot',
  CLOSED: 'Closed',
};

export const CONVERSATION_STAGES_ORDERED = [
  'LEAD',
  'INTRO_CALL',
  'DEMO',
  'PILOT',
  'CLOSED',
] as const;

export const CALL_SENTIMENT_LABELS: Record<string, string> = {
  VERY_POSITIVE: 'Very Positive',
  POSITIVE: 'Positive',
  NEUTRAL: 'Neutral',
  NEGATIVE: 'Negative',
  VERY_NEGATIVE: 'Very Negative',
};

export interface StructuredNotes {
  summary: string;
  keyPoints: string[];
  quotes: string[];
  objections: string[];
  validationSignals: string[];
  commitments: string[];
  nextSteps: string[];
  sentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  sentimentScore: number;
}

export type LeadWithRelations = {
  id: string;
  projectId: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  companySize: string | null;
  companyType: string | null;
  industry: string | null;
  location: string | null;
  source: string;
  notes: string | null;
  priorityScore: number;
  currentStage: string;
  conversationStage: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string; color: string };
  stageHistory: { id: string; stage: string; enteredAt: Date; exitedAt: Date | null }[];
  calls: {
    id: string;
    title: string;
    callDate: Date;
    durationMinutes: number | null;
    sentiment: string | null;
    sentimentScore: number | null;
    structuredNotes: StructuredNotes | null;
    manualNotes: string | null;
    transcript: string | null;
    audioFilePath: string | null;
  }[];
  touchpoints: {
    id: string;
    channel: string;
    direction: string;
    type: string;
    subject: string | null;
    body: string | null;
    sentAt: Date;
    gotReply: boolean;
    notes: string | null;
  }[];
  outreachSequence: {
    id: string;
    currentStep: number;
    maxSteps: number;
    intervalDays: number;
    nextTouchDate: Date | null;
    status: string;
  } | null;
};

export interface DashboardStats {
  activeLeads: number;
  leadsByStage: Record<string, number>;
  overdueFollowUps: number;
  responseRate: number;
  contactedThisWeek: number;
  contactedLastWeek: number;
}
