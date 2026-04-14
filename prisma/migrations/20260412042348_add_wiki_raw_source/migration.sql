-- CreateEnum
CREATE TYPE "WikiDocumentKind" AS ENUM ('PROJECT_INDEX', 'COMPANY', 'PERSON', 'CALL', 'TOPIC');

-- CreateEnum
CREATE TYPE "WikiRawSourceKind" AS ENUM ('URL', 'PDF', 'ARTICLE', 'NOTE', 'IMAGE');

-- AlterTable
ALTER TABLE "CompanySummary" ADD COLUMN     "nextSteps" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "wikiEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WikiDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" "WikiDocumentKind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "frontmatter" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "supersededById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiRawSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "WikiRawSourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "filePath" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiRawSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WikiDocument_supersededById_key" ON "WikiDocument"("supersededById");

-- CreateIndex
CREATE INDEX "WikiDocument_projectId_path_idx" ON "WikiDocument"("projectId", "path");

-- CreateIndex
CREATE INDEX "WikiDocument_projectId_kind_idx" ON "WikiDocument"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "WikiDocument_projectId_path_version_key" ON "WikiDocument"("projectId", "path", "version");

-- CreateIndex
CREATE INDEX "Reminder_leadId_idx" ON "Reminder"("leadId");

-- CreateIndex
CREATE INDEX "Reminder_dueDate_idx" ON "Reminder"("dueDate");

-- CreateIndex
CREATE INDEX "Reminder_completed_idx" ON "Reminder"("completed");

-- CreateIndex
CREATE INDEX "WikiRawSource_projectId_idx" ON "WikiRawSource"("projectId");

-- CreateIndex
CREATE INDEX "WikiRawSource_projectId_kind_idx" ON "WikiRawSource"("projectId", "kind");

-- AddForeignKey
ALTER TABLE "WikiDocument" ADD CONSTRAINT "WikiDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiDocument" ADD CONSTRAINT "WikiDocument_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "WikiDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiRawSource" ADD CONSTRAINT "WikiRawSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
