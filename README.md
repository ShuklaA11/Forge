# LeadFlow

A local-first sales workspace that turns call recordings into a versioned, source-cited wiki — and uses that wiki to ground every AI feature it ships.

Upload a call → Whisper transcribes it → Claude extracts structured notes → a per-project wiki recompiles affected pages (company, person, call, topics, project index) → a consistency lint flags missing facts → a web-search agent proposes citations → you triage and apply them with one click.

**Stack:** Next.js 14 (App Router) · TypeScript · PostgreSQL + Prisma · Anthropic / OpenAI · Whisper · Vitest

---

## Highlights

Things in here that aren't standard CRUD work, with file pointers if you want to read the code:

- **Anti-hallucination guardrail on LLM extraction** — proposed citations are rejected unless the URL appears verbatim in the search results we showed the model. ([`src/lib/wiki/lint/imputation.ts`](src/lib/wiki/lint/imputation.ts) — see `parseProposal`)
- **Content-hashed, versioned document store** — every wiki page is immutable, deduped by hash, with `supersededById` chaining and full history. ([`src/lib/wiki/store.ts`](src/lib/wiki/store.ts))
- **Idempotent fact-apply** — accepting a proposal upserts a bullet under a structured `## Facts` section; re-running is a no-op, same field with a new value replaces in place. ([`src/lib/wiki/lint/imputation.ts`](src/lib/wiki/lint/imputation.ts) — see `upsertFactsSection`)
- **Pluggable search + LLM providers via DI** — `WebSearchProvider` and `LLMFn` interfaces allow tests to inject `StubSearchProvider` and a fake LLM, no network in the test path. ([`src/lib/wiki/lint/search.ts`](src/lib/wiki/lint/search.ts))
- **Scope-driven incremental compile** — orchestrator supports `call`, `lead`, `company`, `topic`, `all` scopes; the `call` scope fans out to exactly the pages that a new call could change. ([`src/lib/wiki/compile.ts`](src/lib/wiki/compile.ts))
- **Pure-function lead scoring** — 0-100 score with weighted factors as a single deterministic function, called after every touchpoint or stage change. ([`src/lib/scoring.ts`](src/lib/scoring.ts))

---

## Architecture: the AI pipeline

```
   ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐
   │ Audio upload │──▶│   Whisper   │──▶│  Claude extract  │
   │ (m4a / mp4)  │   │ transcribe  │   │ structured notes │
   └──────────────┘   └─────────────┘   └────────┬─────────┘
                                                 │
                            ┌────────────────────▼─────────────────────┐
                            │  Wiki compile (scope=call)               │
                            │  → company / person / call / topics      │
                            │  → versioned, content-hashed, backlinked │
                            └────────────────────┬─────────────────────┘
                                                 │
                            ┌────────────────────▼─────────────────────┐
                            │  Consistency lint  +  Imputation         │
                            │  • find missing fields                   │
                            │  • web search per field (DuckDuckGo)     │
                            │  • Claude extracts (JSON, URL allowlist) │
                            │  • persist as MISSING_DATA findings      │
                            └────────────────────┬─────────────────────┘
                                                 │
                            ┌────────────────────▼─────────────────────┐
                            │  UI: triage panel on company wiki page   │
                            │  Apply → upsert under ## Facts, new ver. │
                            │  Dismiss / Mark resolved                 │
                            └──────────────────────────────────────────┘
```

Every step is independently invocable via REST endpoints under `src/app/api/`.

---

## Features

**Sales pipeline**
- Project-scoped leads, grouped by company on the leads page
- Pipeline stages (`Researched → Contacted → Responded → Meeting Booked → Proposal Sent → Closed Won/Lost`) and orthogonal conversation depth (`Lead → Intro Call → Demo → Pilot → Closed`)
- Touchpoint logging across email / call / DM
- Lead scoring (0-100) auto-recalculated on every touchpoint or stage change
- CSV bulk import

**Calls + AI notes**
- Audio upload (m4a / mp4) → Whisper (~$0.12/call) → Claude-structured extraction (summary, key points, objections, validation signals, commitments, sentiment)
- Manual notes path for un-recorded calls, same downstream extraction
- Rolling lead-level and project-level summaries

**Second-brain wiki** (per-project, gated by `wikiEnabled`)
- External source ingest: URLs (Mozilla Readability + Turndown), PDFs (pdf-parse, 10MB cap), notes, articles
- Page kinds: `PROJECT_INDEX`, `COMPANY`, `PERSON`, `CALL`, `TOPIC`
- `[[path/to/page.md]]` backlinks parsed and queryable
- Topics: fixed (`objections`, `competitors`, `icp-patterns`, `pricing-feedback`) plus LLM-discovered
- Lead Expert assistant retrieves wiki context for grounded answers
- Consistency lint + imputation pipeline (see Architecture above)

---

## Setup

```bash
git clone https://github.com/ShuklaA11/LeadFlow.git
cd LeadFlow
npm install --legacy-peer-deps
docker compose up -d                 # PostgreSQL on :5433
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5433/lead_management"' > .env
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000 → Settings → add an Anthropic or OpenAI key.

**Tests:** `npm run test` (Vitest, no DB / network — provider stubs).

---

## Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 14 (App Router, Server Components, Server Actions) |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma |
| UI | shadcn/ui + Tailwind |
| LLM | Anthropic Claude (default) / OpenAI / Ollama |
| Transcription | OpenAI Whisper |
| Tests | Vitest |
| Search | Pluggable `WebSearchProvider` (DuckDuckGo default) |

---

## Where to look

| Concern | File |
|---|---|
| Schema (all entities, all relations) | [`prisma/schema.prisma`](prisma/schema.prisma) |
| Lead scoring (pure function, weights, recalc trigger) | [`src/lib/scoring.ts`](src/lib/scoring.ts) |
| LLM provider abstraction | [`src/lib/llm.ts`](src/lib/llm.ts) |
| Wiki versioned store + hash dedup | [`src/lib/wiki/store.ts`](src/lib/wiki/store.ts) |
| Wiki compile orchestrator | [`src/lib/wiki/compile.ts`](src/lib/wiki/compile.ts) |
| Imputation pipeline + apply | [`src/lib/wiki/lint/imputation.ts`](src/lib/wiki/lint/imputation.ts) |
| Imputation tests (35 cases, all stubbed) | [`src/lib/wiki/lint/imputation.test.ts`](src/lib/wiki/lint/imputation.test.ts) |
| Triage UI | [`src/components/wiki-imputation-panel.tsx`](src/components/wiki-imputation-panel.tsx) |

---

## License

Private project.
