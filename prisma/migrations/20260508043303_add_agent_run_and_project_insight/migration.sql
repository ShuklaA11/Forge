-- CreateEnum
CREATE TYPE "ProjectInsightKind" AS ENUM ('ICP_REFINEMENT', 'PIPELINE_HEALTH');

-- CreateEnum
CREATE TYPE "ProjectInsightStatus" AS ENUM ('PROPOSED', 'APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "projectId" TEXT,
    "leadId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "error" TEXT,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInsight" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectInsightKind" NOT NULL,
    "status" "ProjectInsightStatus" NOT NULL DEFAULT 'PROPOSED',
    "content" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_agent_idx" ON "AgentRun"("agent");

-- CreateIndex
CREATE INDEX "AgentRun_projectId_startedAt_idx" ON "AgentRun"("projectId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AgentRun_leadId_startedAt_idx" ON "AgentRun"("leadId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "ProjectInsight_projectId_kind_generatedAt_idx" ON "ProjectInsight"("projectId", "kind", "generatedAt" DESC);

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInsight" ADD CONSTRAINT "ProjectInsight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
