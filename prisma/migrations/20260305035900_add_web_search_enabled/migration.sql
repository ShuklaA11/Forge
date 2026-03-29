-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('SIZE_1_10', 'SIZE_11_50', 'SIZE_51_200', 'SIZE_200_PLUS');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('SMB', 'BANK');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'REFERRAL', 'LINKEDIN', 'WEBSITE', 'AI_RESEARCH', 'OTHER');

-- CreateEnum
CREATE TYPE "DecisionMakerRole" AS ENUM ('C_SUITE', 'VP', 'DIRECTOR', 'MANAGER', 'OTHER');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('RESEARCHED', 'CONTACTED', 'RESPONDED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'LINKEDIN', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "TouchpointDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "TouchpointType" AS ENUM ('INITIAL', 'FOLLOW_UP', 'REPLY', 'MEETING', 'NOTE');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectCampaignStage" AS ENUM ('IDEATION', 'PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "idea" TEXT,
    "approach" TEXT,
    "campaignStage" "ProjectCampaignStage" NOT NULL DEFAULT 'IDEATION',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT,
    "role" "DecisionMakerRole" NOT NULL DEFAULT 'OTHER',
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "companySize" "CompanySize",
    "companyType" "CompanyType",
    "industry" TEXT,
    "location" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "currentStage" "PipelineStage" NOT NULL DEFAULT 'RESEARCHED',
    "status" "LeadStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStageHistory" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),

    CONSTRAINT "LeadStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Touchpoint" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "direction" "TouchpointDirection" NOT NULL,
    "type" "TouchpointType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gotReply" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSequence" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "templateUsed" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "maxSteps" INTEGER NOT NULL DEFAULT 5,
    "intervalDays" INTEGER NOT NULL DEFAULT 3,
    "nextTouchDate" TIMESTAMP(3),
    "status" "SequenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "aiSuggestions" JSONB,
    "findings" JSONB,
    "status" "ResearchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "llmProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "llmApiKey" TEXT NOT NULL DEFAULT '',
    "webSearchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultMaxTouchpoints" INTEGER NOT NULL DEFAULT 5,
    "defaultIntervalDays" INTEGER NOT NULL DEFAULT 3,
    "outreachTemplates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_projectId_idx" ON "Lead"("projectId");

-- CreateIndex
CREATE INDEX "Lead_priorityScore_idx" ON "Lead"("priorityScore" DESC);

-- CreateIndex
CREATE INDEX "Lead_currentStage_idx" ON "Lead"("currentStage");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "LeadStageHistory_leadId_idx" ON "LeadStageHistory"("leadId");

-- CreateIndex
CREATE INDEX "Touchpoint_leadId_idx" ON "Touchpoint"("leadId");

-- CreateIndex
CREATE INDEX "Touchpoint_sentAt_idx" ON "Touchpoint"("sentAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSequence_leadId_key" ON "OutreachSequence"("leadId");

-- CreateIndex
CREATE INDEX "ResearchSession_projectId_idx" ON "ResearchSession"("projectId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStageHistory" ADD CONSTRAINT "LeadStageHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSequence" ADD CONSTRAINT "OutreachSequence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
