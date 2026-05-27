-- CreateEnum
CREATE TYPE "LeadKind" AS ENUM ('SALES', 'INVESTOR', 'HIRE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "kind" "LeadKind" NOT NULL DEFAULT 'SALES';
