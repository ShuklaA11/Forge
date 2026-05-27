-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('NOTE', 'DECISION', 'DOC_DRAFT');

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "NoteKind" NOT NULL DEFAULT 'NOTE',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkedLeadId" TEXT,
    "linkedCallId" TEXT,
    "linkedInsightId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_projectId_createdAt_idx" ON "Note"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Note_projectId_kind_idx" ON "Note"("projectId", "kind");

-- CreateIndex
CREATE INDEX "Note_linkedLeadId_idx" ON "Note"("linkedLeadId");

-- CreateIndex
CREATE INDEX "Note_linkedCallId_idx" ON "Note"("linkedCallId");

-- CreateIndex
CREATE INDEX "Note_linkedInsightId_idx" ON "Note"("linkedInsightId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_linkedLeadId_fkey" FOREIGN KEY ("linkedLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_linkedCallId_fkey" FOREIGN KEY ("linkedCallId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_linkedInsightId_fkey" FOREIGN KEY ("linkedInsightId") REFERENCES "ProjectInsight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
