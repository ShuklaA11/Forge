import { createHash } from 'crypto';
import type {
  Prisma,
  WikiDocument,
  WikiLintFinding,
  WikiLintSeverity,
} from '@prisma/client';
import { prisma } from '../../db';
import { generateLLMResponse } from '../../llm';
import { listAllLatest } from '../store';

export interface ConsistencyEvidence {
  path: string;
  version: number;
  quote: string;
}

export interface ConsistencyFinding {
  severity: WikiLintSeverity;
  title: string;
  description: string;
  evidence: ConsistencyEvidence[];
}

export interface RunConsistencyLintResult {
  clustersScanned: number;
  clustersSkipped: number;
  findingsCreated: number;
  findingsUpdated: number;
  llmCalls: number;
  parseErrors: number;
}

export type LLMFn = (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens?: number,
) => Promise<string>;

const VALID_SEVERITIES: WikiLintSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];
const MAX_CALLS_PER_CLUSTER = 8;
const CALL_DOC_TRUNCATE_CHARS = 600;
const FULL_DOC_TRUNCATE_CHARS = 4000;

const SYSTEM_PROMPT = `You are a fact-checker for a sales-intelligence wiki. You will be given a set of wiki pages about a single company. Find pairs of statements that DIRECTLY contradict each other on objective facts (company size, headcount, industry, decision-maker title, budget, timeline, product fit). Ignore subjective tone differences, paraphrasing, or stale-but-not-contradicted facts. Only flag genuine contradictions where two pages assert mutually exclusive things.

Return ONLY valid JSON matching this schema, no prose, no markdown fences:
{
  "findings": [
    {
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "title": "short headline",
      "description": "one paragraph explaining the contradiction, quoting both sides",
      "evidence": [
        { "path": "exact path from input", "quote": "exact substring from that page" },
        { "path": "exact path from input", "quote": "exact substring from that page" }
      ]
    }
  ]
}

If there are no contradictions, return {"findings": []}.`;

interface DocCluster {
  companyDoc: WikiDocument;
  personDocs: WikiDocument[];
  callDocs: WikiDocument[];
}

async function buildClusters(projectId: string): Promise<DocCluster[]> {
  const all = await listAllLatest(projectId);
  const companies = all.filter((d) => d.kind === 'COMPANY');
  const persons = all.filter((d) => d.kind === 'PERSON');
  const calls = all.filter((d) => d.kind === 'CALL');

  const clusters: DocCluster[] = [];

  for (const companyDoc of companies) {
    const linkedPersons = persons.filter((p) => docLinksTo(p, companyDoc.path));
    const linkedCalls = calls
      .filter((c) => docLinksTo(c, companyDoc.path))
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
      .slice(0, MAX_CALLS_PER_CLUSTER);

    clusters.push({ companyDoc, personDocs: linkedPersons, callDocs: linkedCalls });
  }

  return clusters;
}

function docLinksTo(doc: WikiDocument, targetPath: string): boolean {
  const fm = doc.frontmatter as { backlinks?: unknown } | null;
  const bl = Array.isArray(fm?.backlinks) ? (fm!.backlinks as unknown[]) : [];
  return bl.some((b) => typeof b === 'string' && b === targetPath);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '\n…[truncated]';
}

function clusterTotalDocs(cluster: DocCluster): number {
  return 1 + cluster.personDocs.length + cluster.callDocs.length;
}

export function buildClusterPrompt(cluster: DocCluster): string {
  const blocks: string[] = [];

  blocks.push(formatDocBlock(cluster.companyDoc, FULL_DOC_TRUNCATE_CHARS));
  for (const p of cluster.personDocs) {
    blocks.push(formatDocBlock(p, FULL_DOC_TRUNCATE_CHARS));
  }
  for (const c of cluster.callDocs) {
    blocks.push(formatDocBlock(c, CALL_DOC_TRUNCATE_CHARS));
  }

  return blocks.join('\n\n---\n\n');
}

function formatDocBlock(doc: WikiDocument, max: number): string {
  return `PATH: ${doc.path}\nVERSION: ${doc.version}\nKIND: ${doc.kind}\n\n${truncate(doc.content, max)}`;
}

export function parseFindings(raw: string): ConsistencyFinding[] {
  const cleaned = stripJsonFences(raw).trim();
  if (!cleaned) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  if (!parsed || typeof parsed !== 'object') return [];
  const findingsRaw = (parsed as { findings?: unknown }).findings;
  if (!Array.isArray(findingsRaw)) return [];

  const out: ConsistencyFinding[] = [];
  for (const f of findingsRaw) {
    if (!f || typeof f !== 'object') continue;
    const obj = f as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    const evidenceRaw = Array.isArray(obj.evidence) ? obj.evidence : [];
    const evidence: ConsistencyEvidence[] = [];
    for (const e of evidenceRaw) {
      if (!e || typeof e !== 'object') continue;
      const eo = e as Record<string, unknown>;
      const path = typeof eo.path === 'string' ? eo.path : '';
      const quote = typeof eo.quote === 'string' ? eo.quote : '';
      if (path && quote) evidence.push({ path, version: 0, quote });
    }
    if (!title || !description || evidence.length < 2) continue;

    const severityRaw = typeof obj.severity === 'string' ? obj.severity.toUpperCase() : 'MEDIUM';
    const severity: WikiLintSeverity = (VALID_SEVERITIES as string[]).includes(severityRaw)
      ? (severityRaw as WikiLintSeverity)
      : 'MEDIUM';

    out.push({ severity, title, description, evidence });
  }
  return out;
}

function stripJsonFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export function fingerprintFinding(
  projectId: string,
  finding: Pick<ConsistencyFinding, 'evidence'> & { kind?: string },
): string {
  const paths = finding.evidence.map((e) => e.path).sort();
  const quotes = finding.evidence
    .map((e) => e.quote.toLowerCase().replace(/\s+/g, ' ').trim())
    .sort();
  const canonical = JSON.stringify({
    projectId,
    kind: finding.kind ?? 'INCONSISTENCY',
    paths,
    quotes,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function validateEvidencePaths(
  finding: ConsistencyFinding,
  cluster: DocCluster,
): ConsistencyFinding | null {
  const allPaths = new Set<string>([
    cluster.companyDoc.path,
    ...cluster.personDocs.map((d) => d.path),
    ...cluster.callDocs.map((d) => d.path),
  ]);
  const versionByPath = new Map<string, number>([
    [cluster.companyDoc.path, cluster.companyDoc.version],
    ...cluster.personDocs.map((d) => [d.path, d.version] as [string, number]),
    ...cluster.callDocs.map((d) => [d.path, d.version] as [string, number]),
  ]);

  const cleaned = finding.evidence
    .filter((e) => allPaths.has(e.path))
    .map((e) => ({ ...e, version: versionByPath.get(e.path) ?? 0 }));
  if (cleaned.length < 2) return null;

  const uniquePaths = new Set(cleaned.map((e) => e.path));
  if (uniquePaths.size < 2) return null;

  return { ...finding, evidence: cleaned };
}

export async function runConsistencyLint(
  projectId: string,
  llmFn: LLMFn = generateLLMResponse,
): Promise<RunConsistencyLintResult> {
  const result: RunConsistencyLintResult = {
    clustersScanned: 0,
    clustersSkipped: 0,
    findingsCreated: 0,
    findingsUpdated: 0,
    llmCalls: 0,
    parseErrors: 0,
  };

  const clusters = await buildClusters(projectId);

  for (const cluster of clusters) {
    if (clusterTotalDocs(cluster) < 2) {
      result.clustersSkipped++;
      continue;
    }
    result.clustersScanned++;

    const userPrompt = buildClusterPrompt(cluster);
    let raw: string;
    try {
      raw = await llmFn(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        2048,
      );
      result.llmCalls++;
    } catch {
      result.parseErrors++;
      continue;
    }

    const findings = parseFindings(raw);
    if (findings.length === 0) {
      // Could be genuine zero or a parse failure; parser already handled bad JSON gracefully.
      continue;
    }

    for (const f of findings) {
      const validated = validateEvidencePaths(f, cluster);
      if (!validated) continue;
      const upserted = await upsertFinding(projectId, cluster, validated);
      if (upserted === 'created') result.findingsCreated++;
      else if (upserted === 'updated') result.findingsUpdated++;
    }
  }

  return result;
}

async function upsertFinding(
  projectId: string,
  cluster: DocCluster,
  finding: ConsistencyFinding,
): Promise<'created' | 'updated'> {
  const fingerprint = fingerprintFinding(projectId, finding);
  const docPaths = Array.from(new Set(finding.evidence.map((e) => e.path))).sort();

  const existing = await prisma.wikiLintFinding.findUnique({
    where: { projectId_fingerprint: { projectId, fingerprint } },
  });

  if (existing) {
    await prisma.wikiLintFinding.update({
      where: { id: existing.id },
      data: {
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        docPaths: docPaths as unknown as Prisma.InputJsonValue,
        evidence: finding.evidence as unknown as Prisma.InputJsonValue,
      },
    });
    return 'updated';
  }

  await prisma.wikiLintFinding.create({
    data: {
      projectId,
      kind: 'INCONSISTENCY',
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      docPaths: docPaths as unknown as Prisma.InputJsonValue,
      evidence: finding.evidence as unknown as Prisma.InputJsonValue,
      fingerprint,
    },
  });
  return 'created';
}

export async function listFindings(
  projectId: string,
  status: 'OPEN' | 'DISMISSED' | 'RESOLVED' = 'OPEN',
): Promise<WikiLintFinding[]> {
  return prisma.wikiLintFinding.findMany({
    where: { projectId, status, kind: 'INCONSISTENCY' },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  });
}

// Re-export for test wiring
export { buildClusters, clusterTotalDocs };
