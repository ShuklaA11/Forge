-- CreateEnum
CREATE TYPE "ConversationStage" AS ENUM ('LEAD', 'INTRO_CALL', 'DEMO', 'PILOT', 'CLOSED');

-- CreateEnum
CREATE TYPE "CallSentiment" AS ENUM ('VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "conversationStage" "ConversationStage" NOT NULL DEFAULT 'LEAD';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "openaiApiKey" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "callDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "audioFilePath" TEXT,
    "transcript" TEXT,
    "manualNotes" TEXT,
    "structuredNotes" JSONB,
    "sentiment" "CallSentiment",
    "sentimentScore" DOUBLE PRECISION,
    "touchpointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAnnotation" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "timestamp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Call_touchpointId_key" ON "Call"("touchpointId");

-- CreateIndex
CREATE INDEX "Call_leadId_idx" ON "Call"("leadId");

-- CreateIndex
CREATE INDEX "Call_callDate_idx" ON "Call"("callDate" DESC);

-- CreateIndex
CREATE INDEX "CallAnnotation_callId_idx" ON "CallAnnotation"("callId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_touchpointId_fkey" FOREIGN KEY ("touchpointId") REFERENCES "Touchpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnnotation" ADD CONSTRAINT "CallAnnotation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
