-- CreateTable
CREATE TABLE "CompanySummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "insights" TEXT NOT NULL,
    "leadsIncluded" JSONB NOT NULL,
    "lastCallDate" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "insights" TEXT NOT NULL,
    "companyCount" INTEGER NOT NULL DEFAULT 0,
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanySummary_projectId_idx" ON "CompanySummary"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySummary_projectId_companyName_key" ON "CompanySummary"("projectId", "companyName");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSummary_projectId_key" ON "ProjectSummary"("projectId");

-- AddForeignKey
ALTER TABLE "CompanySummary" ADD CONSTRAINT "CompanySummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSummary" ADD CONSTRAINT "ProjectSummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
