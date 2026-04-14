# Plan: Project-Scoped Second Brain (LLM-Compiled Wiki)

## Context

Apply Karpathy's LLM knowledge-base pattern to LeadFlow: each Project gets a wiki of LLM-generated, cross-linked `WikiDocument` pages compiled from raw sources (calls, touchpoints, leads, plus external articles/PDFs). The wiki becomes the primary context for the Lead Expert assistant, replacing flat `CompanySummary` / `ProjectSummary` blobs.

## What Already Exists

- `WikiDocument` model (versioned, backlinked, content-hashed, superseded-chain)
- `WikiDocumentKind`: `PROJECT_INDEX | COMPANY | PERSON | CALL | TOPIC`
- `Project.wikiEnabled` flag
- `src/lib/wiki/paths.ts` — slugs + path helpers + backlink parser
- `src/lib/wiki/store.ts` — `writeDoc`, `readLatest`, `getBacklinks`, `getHistory`

## What's Missing

- External raw-source ingest
- Compile orchestrator + per-kind generators
- Topic discovery (fixed + LLM-proposed)
- Compile triggers on call processing
- Wiki viewer UI
- Assistant retrieval layer

## Design Decisions (confirmed)

- **Raw sources** include external URLs/PDFs/pastes, not just LeadFlow entities
- **Incremental compile** — triggered after each call is processed, scoped to affected pages
- **Q&A extends Lead Expert assistant**, not a separate chat
- **Topics** are both fixed (objections, competitors, ICP, pricing feedback) and LLM-proposed
- **UI v1**: list/tree, markdown render, backlinks panel, version history — no graph view, no Obsidian export
- **Linting** deferred to Phase 2

---

## Phase 1 — Ingest & Compile

### Sub-task 1: Raw Source Schema
**Files**: `prisma/schema.prisma`, `src/types/index.ts` (+ migration)

- Add `WikiRawSourceKind` enum: `URL | PDF | ARTICLE | NOTE | IMAGE`
- Add `WikiRawSource` model: `id`, `projectId`, `kind`, `title`, `url?`, `filePath?`, `content` (extracted markdown), `metadata Json?` (author, publishedAt, tags, associated companyName/leadId), `createdAt`, `updatedAt`. Index on `(projectId)`, `(projectId, kind)`
- Relation from `Project`
- Export matching TS types

### Sub-task 2: Raw Source Ingest API + Extraction
**Files**: `src/lib/wiki/ingest.ts` (new), `src/app/api/wiki/sources/route.ts` (new), `src/app/api/wiki/sources/[id]/route.ts` (new)

- `ingest.ts`: `fetchUrl(url)` → HTML → markdown via mozilla-readability + turndown; `extractPdf(path)` via `pdf-parse`; `ingestNote(text)` pass-through
- `POST /api/wiki/sources` — body `{ projectId, kind, url? | filePath? | content?, title?, metadata? }` → runs extraction → writes `WikiRawSource`
- `GET /api/wiki/sources?projectId=` — list
- `GET/DELETE /api/wiki/sources/[id]`
- File uploads reuse existing `/uploads/` pattern

### Sub-task 3: Compile Orchestrator + Prompts
**Files**: `src/lib/wiki/compile.ts` (new), `src/lib/wiki/prompts.ts` (new), `src/lib/wiki/context.ts` (new)

- `compile.ts`: `compileProject(projectId, scope: { kind: 'all' | 'company' | 'lead' | 'call', id? })` → determines affected pages → calls generators → returns `{ written, skipped, versioned }`
- `context.ts`: `buildCompanyContext(projectId, companyName)` etc. — gathers raw inputs (leads, calls, touchpoints, tagged raw sources) for a generator
- `prompts.ts`: centralized generator prompts with strict markdown + `[[backlink]]` format requirements

### Sub-task 4: Entity Page Generators
**Files**: `src/lib/wiki/generators/company.ts`, `src/lib/wiki/generators/person.ts`, `src/lib/wiki/generators/call.ts` (all new)

- Each exports `generate(projectId, entityId): Promise<WriteDocResult>`
- Reads entity context via `context.ts`, calls LLM with prompt from `prompts.ts`, writes via `store.writeDoc`
- Company: overview, people links, call highlights, current state, open questions
- Person: role, engagement history, quotes, stance, next steps
- Call: summary, timeline, key moments, quotes, backlinks to company + person + topics

### Sub-task 5: Index + Topic Generators
**Files**: `src/lib/wiki/generators/project-index.ts` (new), `src/lib/wiki/generators/topic.ts` (new), `src/lib/wiki/topics.ts` (new)

- `project-index.ts`: renders project-wide overview + links to all companies/topics
- `topic.ts`: `generateTopic(projectId, topicKey)` — aggregates across all calls/companies for that topic, writes TOPIC doc
- `topics.ts`:
  - `FIXED_TOPICS = ['objections', 'competitors', 'icp-patterns', 'pricing-feedback']`
  - `discoverTopics(projectId)` — LLM reads current wiki + proposes new topic candidates → returns `{ key, title, rationale }[]`
- `POST /api/wiki/topics` / `GET` handled in sub-task 6

### Sub-task 6: Compile API + Call Processing Hook
**Files**: `src/app/api/wiki/compile/route.ts` (new), `src/app/api/wiki/topics/route.ts` (new), `src/app/api/calls/process/route.ts` (modify)

- `POST /api/wiki/compile` — body `{ projectId, scope? }` → runs `compileProject`
- `GET /api/wiki/topics?projectId=` — list discovered + fixed; `POST` — approve/materialize a discovered topic
- In `calls/process`: after existing company-summary step, if `project.wikiEnabled`, call `compileProject(projectId, { kind: 'call', id: callId })` — generator fans out to: that call's CALL page, its PERSON page, its COMPANY page, plus any TOPIC pages whose keywords appear in structured notes. Wrapped in try/catch so wiki failures don't break call processing.

### Sub-task 7: Wiki Viewer UI
**Files**: `src/app/projects/[id]/wiki/page.tsx` (new), `src/app/projects/[id]/wiki/[...path]/page.tsx` (new), `src/components/wiki-tree.tsx` (new)

- Index page: sidebar tree grouped by kind (Companies / People / Calls / Topics / Project), main pane shows project index doc
- Detail page: renders markdown (reuse existing markdown component if present, else add `react-markdown`), backlinks panel (via `getBacklinks`), version dropdown (via `getHistory`)
- Add "Recompile" button → `POST /api/wiki/compile`
- Add link from project page to `/projects/[id]/wiki` gated on `wikiEnabled`

### Sub-task 8: Assistant Retrieval Integration
**Files**: `src/lib/wiki/retrieve.ts` (new), Lead Expert assistant context builder (1 file — TBD during exec), `src/app/api/assistant/*/route.ts` (1 file — TBD)

- `retrieve.ts`: `retrieveRelevantDocs(projectId, query, limit=8)` — simple keyword scoring over title + backlinks + content tf; returns top-N wiki docs
- Assistant context: when a projectId is in scope and `wikiEnabled`, prepend top-K wiki docs to system prompt (replacing or augmenting current `CompanySummary`/`ProjectSummary` injection)
- **Discovery needed at exec time**: locate exact Lead Expert context-building file. Grep for `projectSummary` / `companySummary` usage in `src/app/api/` to pin it down before touching.

### Build Order
1 → 2 → 3 → 4 → 5 → 6 → 7, 8 in parallel

---

## Phase 2 — Linting & Health Checks

### Sub-task 1: Inconsistency Detection
- `src/lib/wiki/lint/consistency.ts` — LLM pass finds contradicting facts across pages (e.g. company size stated differently on two call notes)
- Emits `WikiLintFinding` records

### Sub-task 2: Missing Data Imputation
- `src/lib/wiki/lint/impute.ts` — for companies with sparse pages, web-search fill via existing provider, proposes patches (user approves)

### Sub-task 3: New Article Candidates
- `src/lib/wiki/lint/candidates.ts` — LLM proposes new TOPIC articles based on recurring un-indexed patterns in call notes
- UI list with one-click materialize (reuses topic generator)

### Sub-task 4: Lint Dashboard
- `src/app/projects/[id]/wiki/health/page.tsx` — findings + candidates with approve/dismiss

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Compile LLM cost per call | Scope-based incremental compile; `contentHash` skip in `store.writeDoc` avoids rewrites of unchanged pages |
| HTML→markdown quality on external articles | mozilla-readability + turndown is battle-tested; fall back to raw text + clear "extraction failed" flag |
| Topic explosion | Cap discovered topics per compile; require user approval to materialize new topics |
| Assistant context blowup | `retrieveRelevantDocs` caps at top-K; truncate long docs with summary fallback from frontmatter |
| Wiki generation breaks call processing | Wrap compile hook in try/catch; log but never fail the call-process request |
| PDF extraction memory | Cap file size at ingest (10MB); reject oversized with clear error |

## Post-Code Risk Assessment (per CLAUDE.md §3)

To be produced after each sub-task lands. Template:
- What could break (edge cases, integration points)
- Suggested tests

## Verification

Per sub-task:
1. `npx prisma migrate dev` after schema changes
2. Unit test generators with fixture project data
3. End-to-end: create project → enable wiki → ingest a URL → upload a call → verify company/person/call/topic pages written → ask assistant a question → confirm wiki docs appear in context
4. Version bump sanity: recompile twice, confirm no new versions on unchanged content (hash skip works)

## Open Questions Deferred to Execution

- Exact file for Lead Expert context building (sub-task 8) — grep first
- Whether to reuse existing markdown renderer component or add `react-markdown`
- Whether `project.wikiEnabled` should default true for new projects (currently false) — ask before flipping
