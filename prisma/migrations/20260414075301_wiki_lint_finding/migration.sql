-- CreateEnum
CREATE TYPE "WikiLintFindingKind" AS ENUM ('INCONSISTENCY', 'MISSING_DATA', 'TOPIC_CANDIDATE');

-- CreateEnum
CREATE TYPE "WikiLintFindingStatus" AS ENUM ('OPEN', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WikiLintSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "WikiLintFinding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "WikiLintFindingKind" NOT NULL,
    "severity" "WikiLintSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "WikiLintFindingStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "docPaths" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WikiLintFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiLintFinding_projectId_status_idx" ON "WikiLintFinding"("projectId", "status");

-- CreateIndex
CREATE INDEX "WikiLintFinding_projectId_kind_status_idx" ON "WikiLintFinding"("projectId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WikiLintFinding_projectId_fingerprint_key" ON "WikiLintFinding"("projectId", "fingerprint");

-- AddForeignKey
ALTER TABLE "WikiLintFinding" ADD CONSTRAINT "WikiLintFinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
