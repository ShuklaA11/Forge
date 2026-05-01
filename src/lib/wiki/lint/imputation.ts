import { createHash } from 'crypto';
import type { Prisma, WikiLintFinding, WikiLintSeverity } from '@prisma/client';
import { prisma } from '../../db';
import { generateLLMResponse } from '../../llm';
import { companyIndexPath } from '../paths';
import { readLatest, writeDoc, type WikiSource } from '../store';
import { getSearchProvider, type WebSearchProvider, type SearchResult } from './search';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type ImputationField =
  | 'headcount'
  | 'industry'
  | 'hqLocation'
  | 'foundedYear'
  | 'fundingStage';

export interface ImputationProposal {
  field: ImputationField;
  value: string;
  confidence: Confidence;
  sourceUrl: string;
  quote: string;
}

export interface ImputeCompanyDeps {
  search?: WebSearchProvider;
  llm?: LLMFn;
}

export type LLMFn = (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens?: number,
) => Promise<string>;

export const IMPUTATION_FIELDS: ImputationField[] = [
  'headcount',
  'industry',
  'hqLocation',
  'foundedYear',
  'fundingStage',
];

const MAX_LLM_CALLS = 5;
const SEARCH_RESULTS_PER_FIELD = 3;
const VALID_CONFIDENCES: Confidence[] = ['LOW', 'MEDIUM', 'HIGH'];

const FIELD_SYNONYMS: Record<ImputationField, string[]> = {
  headcount: ['headcount', 'employees', 'team size', 'company size', 'staff'],
  industry: ['industry', 'sector', 'vertical'],
  hqLocation: ['hq', 'headquarters', 'headquartered', 'based in', 'location'],
  foundedYear: ['founded', 'founding year', 'established', 'incorporated'],
  fundingStage: ['funding', 'raised', 'series ', 'seed', 'pre-seed', 'stage'],
};

const FIELD_LABEL: Record<ImputationField, string> = {
  headcount: 'employee headcount',
  industry: 'industry / sector',
  hqLocation: 'HQ location (city, country)',
  foundedYear: 'year founded',
  fundingStage: 'funding stage (e.g. Seed, Series A)',
};

const SYSTEM_PROMPT = `You are extracting a single objective fact about a company from web search snippets. You will be given a company name, the field to extract, and 1-3 search result snippets. Pick the snippet that best supports an answer and extract a concise value.

Return ONLY valid JSON, no prose, no markdown fences:
{
  "value": "concise extracted value, e.g. '~250 employees' or 'Series B'",
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "sourceUrl": "exact url from one of the input snippets",
  "quote": "exact substring (<=200 chars) from that snippet supporting the value"
}

If no snippet supports an answer, return: {"value": null}`;

export function isFieldPresent(content: string, field: ImputationField): boolean {
  const lower = content.toLowerCase();
  return FIELD_SYNONYMS[field].some((syn) => lower.includes(syn));
}

export function findMissingFields(content: string): ImputationField[] {
  return IMPUTATION_FIELDS.filter((f) => !isFieldPresent(content, f));
}

export function buildQuery(companyName: string, field: ImputationField): string {
  return `"${companyName}" ${FIELD_LABEL[field]}`;
}

export function buildUserPrompt(
  companyName: string,
  field: ImputationField,
  results: SearchResult[],
): string {
  const blocks = results.map(
    (r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\nSNIPPET: ${r.snippet}`,
  );
  return `Company: ${companyName}\nField: ${FIELD_LABEL[field]}\n\nSearch results:\n${blocks.join('\n\n')}`;
}

export function parseProposal(
  raw: string,
  field: ImputationField,
  allowedUrls: Set<string>,
): ImputationProposal | null {
  const cleaned = stripJsonFences(raw).trim();
  if (!cleaned) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.value === null) return null;
  const value = typeof obj.value === 'string' ? obj.value.trim() : '';
  const sourceUrl = typeof obj.sourceUrl === 'string' ? obj.sourceUrl.trim() : '';
  const quote = typeof obj.quote === 'string' ? obj.quote.trim() : '';
  if (!value || !sourceUrl || !quote) return null;
  if (!allowedUrls.has(sourceUrl)) return null;

  const confRaw =
    typeof obj.confidence === 'string' ? obj.confidence.toUpperCase() : 'LOW';
  const confidence: Confidence = (VALID_CONFIDENCES as string[]).includes(confRaw)
    ? (confRaw as Confidence)
    : 'LOW';

  return { field, value, confidence, sourceUrl, quote };
}

function stripJsonFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export interface ImputeCompanyResult {
  companyName: string;
  missingFields: ImputationField[];
  proposals: ImputationProposal[];
  searchCalls: number;
  llmCalls: number;
}

export async function imputeCompanyFacts(
  projectId: string,
  companyName: string,
  deps: ImputeCompanyDeps = {},
): Promise<ImputeCompanyResult> {
  const search = deps.search ?? getSearchProvider();
  const llm = deps.llm ?? generateLLMResponse;

  const path = companyIndexPath(companyName);
  const doc = await readLatest(projectId, path);
  if (!doc) {
    return {
      companyName,
      missingFields: [],
      proposals: [],
      searchCalls: 0,
      llmCalls: 0,
    };
  }

  const missing = findMissingFields(doc.content).slice(0, MAX_LLM_CALLS);
  const proposals: ImputationProposal[] = [];
  let searchCalls = 0;
  let llmCalls = 0;

  for (const field of missing) {
    let results: SearchResult[];
    try {
      results = await search.search(buildQuery(companyName, field), {
        maxResults: SEARCH_RESULTS_PER_FIELD,
      });
      searchCalls++;
    } catch {
      continue;
    }
    if (results.length === 0) continue;

    const allowedUrls = new Set(results.map((r) => r.url));
    let raw: string;
    try {
      raw = await llm(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(companyName, field, results) },
        ],
        512,
      );
      llmCalls++;
    } catch {
      continue;
    }

    const proposal = parseProposal(raw, field, allowedUrls);
    if (proposal) proposals.push(proposal);
  }

  return {
    companyName,
    missingFields: missing,
    proposals,
    searchCalls,
    llmCalls,
  };
}

const CONFIDENCE_TO_SEVERITY: Record<Confidence, WikiLintSeverity> = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

export function fingerprintProposal(
  projectId: string,
  companyPath: string,
  field: ImputationField,
): string {
  const canonical = JSON.stringify({
    projectId,
    kind: 'MISSING_DATA',
    path: companyPath,
    field,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export interface PersistProposalsResult {
  created: number;
  updated: number;
  rows: WikiLintFinding[];
}

export async function persistProposals(
  projectId: string,
  companyName: string,
  proposals: ImputationProposal[],
): Promise<PersistProposalsResult> {
  const companyPath = companyIndexPath(companyName);
  const result: PersistProposalsResult = { created: 0, updated: 0, rows: [] };

  for (const p of proposals) {
    const fingerprint = fingerprintProposal(projectId, companyPath, p.field);
    const evidence = [
      {
        field: p.field,
        value: p.value,
        confidence: p.confidence,
        sourceUrl: p.sourceUrl,
        quote: p.quote,
      },
    ];
    const data = {
      title: `Missing: ${p.field}`,
      description: `${p.value} (confidence: ${p.confidence}) — ${p.quote}`,
      severity: CONFIDENCE_TO_SEVERITY[p.confidence],
      docPaths: [companyPath] as unknown as Prisma.InputJsonValue,
      evidence: evidence as unknown as Prisma.InputJsonValue,
    };

    const existing = await prisma.wikiLintFinding.findUnique({
      where: { projectId_fingerprint: { projectId, fingerprint } },
    });

    if (existing) {
      const row = await prisma.wikiLintFinding.update({
        where: { id: existing.id },
        data,
      });
      result.updated++;
      result.rows.push(row);
    } else {
      const row = await prisma.wikiLintFinding.create({
        data: {
          projectId,
          kind: 'MISSING_DATA',
          fingerprint,
          ...data,
        },
      });
      result.created++;
      result.rows.push(row);
    }
  }

  return result;
}

export async function listImputationProposals(
  projectId: string,
  status: 'OPEN' | 'DISMISSED' | 'RESOLVED' = 'OPEN',
): Promise<WikiLintFinding[]> {
  return prisma.wikiLintFinding.findMany({
    where: { projectId, status, kind: 'MISSING_DATA' },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  });
}

const FACTS_HEADING = '## Facts';

const FIELD_DISPLAY: Record<ImputationField, string> = {
  headcount: 'Headcount',
  industry: 'Industry',
  hqLocation: 'HQ',
  foundedYear: 'Founded',
  fundingStage: 'Funding stage',
};

interface ProposalEvidence {
  field: ImputationField;
  value: string;
  confidence: Confidence;
  sourceUrl: string;
  quote: string;
}

function readEvidence(raw: unknown): ProposalEvidence | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const e = raw[0];
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const field = typeof o.field === 'string' ? (o.field as ImputationField) : null;
  const value = typeof o.value === 'string' ? o.value : null;
  const sourceUrl = typeof o.sourceUrl === 'string' ? o.sourceUrl : null;
  const quote = typeof o.quote === 'string' ? o.quote : '';
  const confidence =
    typeof o.confidence === 'string' && (VALID_CONFIDENCES as string[]).includes(o.confidence)
      ? (o.confidence as Confidence)
      : 'LOW';
  if (!field || !value || !sourceUrl) return null;
  if (!IMPUTATION_FIELDS.includes(field)) return null;
  return { field, value, confidence, sourceUrl, quote };
}

export function buildFactBullet(ev: ProposalEvidence): string {
  return `- **${FIELD_DISPLAY[ev.field]}:** ${ev.value} — [source](${ev.sourceUrl})`;
}

export function upsertFactsSection(content: string, ev: ProposalEvidence): string {
  const bullet = buildFactBullet(ev);
  const fieldMarker = `**${FIELD_DISPLAY[ev.field]}:**`;
  const lines = content.split('\n');
  const headingIdx = lines.findIndex((l) => l.trim() === FACTS_HEADING);

  if (headingIdx === -1) {
    const trimmed = content.replace(/\s+$/, '');
    return `${trimmed}\n\n${FACTS_HEADING}\n\n${bullet}\n`;
  }

  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  for (let i = headingIdx + 1; i < endIdx; i++) {
    if (lines[i].includes(fieldMarker)) {
      if (lines[i] === bullet) return content;
      lines[i] = bullet;
      return lines.join('\n');
    }
  }

  let insertAt = endIdx;
  while (insertAt > headingIdx + 1 && lines[insertAt - 1].trim() === '') {
    insertAt--;
  }
  lines.splice(insertAt, 0, bullet);
  return lines.join('\n');
}

export interface ApplyProposalResult {
  status: 'APPLIED' | 'ALREADY_PRESENT';
  findingId: string;
  docPath: string;
  newVersion: number;
}

export async function applyProposal(findingId: string): Promise<ApplyProposalResult> {
  const finding = await prisma.wikiLintFinding.findUnique({ where: { id: findingId } });
  if (!finding) throw new Error('Proposal not found');
  if (finding.kind !== 'MISSING_DATA') {
    throw new Error('Only MISSING_DATA findings can be applied');
  }

  const ev = readEvidence(finding.evidence);
  if (!ev) throw new Error('Proposal has no usable evidence');

  const docPaths = Array.isArray(finding.docPaths) ? (finding.docPaths as unknown[]) : [];
  const docPath = docPaths.find((p): p is string => typeof p === 'string');
  if (!docPath) throw new Error('Proposal has no target doc path');

  const doc = await readLatest(finding.projectId, docPath);
  if (!doc) throw new Error(`Company doc not found at ${docPath}`);

  const nextContent = upsertFactsSection(doc.content, ev);
  const fm = (doc.frontmatter ?? {}) as { title?: unknown; backlinks?: unknown; [k: string]: unknown };
  const title = typeof fm.title === 'string' ? fm.title : docPath;
  const backlinks = Array.isArray(fm.backlinks)
    ? (fm.backlinks as unknown[]).filter((b): b is string => typeof b === 'string')
    : [];
  const priorSources = Array.isArray(doc.sources) ? (doc.sources as unknown as WikiSource[]) : [];
  const sources: WikiSource[] = [
    ...priorSources,
    { type: 'wiki', id: `imputation:${finding.id}` },
  ];

  const written = await writeDoc({
    projectId: finding.projectId,
    path: docPath,
    kind: doc.kind,
    content: nextContent,
    frontmatter: { ...fm, title, backlinks },
    sources,
  });

  await prisma.wikiLintFinding.update({
    where: { id: finding.id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  return {
    status: written.versionBumped || written.created ? 'APPLIED' : 'ALREADY_PRESENT',
    findingId: finding.id,
    docPath,
    newVersion: written.doc.version,
  };
}
