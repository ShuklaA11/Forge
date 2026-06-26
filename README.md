# Forge

A local-first, per-project workspace for founders. Each project gets a chat-first home with a persona-aware assistant that can read your data and write notes, tasks, metrics, and saved resources directly. Sales, investor outreach, and hiring all live in the same pipeline - separated by `Lead.kind`, not separate apps.

Underneath the chat sits a versioned wiki, AI-grounded retrieval, a tool-use loop, and an evolving set of agents (lead discovery, reply triage, call coach, meeting prep, pipeline health, ICP refiner, news ingestion).

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL + Prisma · Anthropic / OpenAI · Whisper · Vitest

---

## What's in here

**Per-project assistant (the headline)**
- Chat-first project home at `/projects/[id]` - replaces the old dashboard.
- Five personas, switchable per conversation: **Lead expert · Investor · Hiring · Writer · Brainstormer**. Each has its own system-prompt addendum; tools are shared.
- Native Anthropic tool-use loop. Tools the assistant can call directly: `create_note`, `create_task`, `record_metric`, `save_resource`. Tool calls show as breadcrumbs in the chat and persist on the message row.
- Retrieval composes wiki docs + saved resources + project state into every turn.

**Project primitives** (each one schema + REST + assistant tool)
- `Note { kind: NOTE | DECISION | DOC_DRAFT }` with zero-or-one link to a lead, call, or insight.
- `Task` (project-scoped, optional `leadId`).
- `Metric` (append-only time series, project-scoped, named).
- `Resource` (saved URLs with auto-fetched OG metadata, user notes, free-form tags) - feeds Assistant context via keyword retrieval alongside the wiki.

**Pipeline** (the original spine, still here)
- `Lead.kind = SALES | INVESTOR | HIRE` - same stage machinery for all three.
- Pipeline stages and orthogonal conversation depth, scored 0–100 by a pure function.
- Touchpoint logging across email / call / DM.
- CSV bulk import.

**Calls + AI notes**
- Audio (m4a / mp4) → Whisper → Claude structured extraction (summary, key points, objections, signals, commitments, sentiment).
- Manual notes path for un-recorded calls, same downstream extraction.
- Rolling company-level and project-level summaries.

**Second-brain wiki** (per-project, gated by `wikiEnabled`)
- External source ingest: URLs (Mozilla Readability + Turndown), PDFs (pdf-parse, 10MB cap), notes, articles.
- Page kinds: `PROJECT_INDEX`, `COMPANY`, `PERSON`, `CALL`, `TOPIC`.
- `[[path/to/page.md]]` backlinks parsed and queryable.
- Topics: fixed (`objections`, `competitors`, `icp-patterns`, `pricing-feedback`) plus LLM-discovered.
- Consistency lint + imputation pipeline (see [Architecture](#architecture-the-wiki-ai-pipeline)).

**Agents** (`src/lib/agents/`)
- In-flow: `lead-discovery`, `reply-triage`, `call-coach`, `meeting-prep`.
- Scheduled (node-cron, wired in `instrumentation.ts`): `pipeline-health` (daily), `icp-refiner` (weekly), `news-ingest` (daily).
- All structured-output agents go through `runtime.ts` (Zod-validated, retry-once-on-parse-failure, per-agent token budget).
- All runs logged to `AgentRun` for cost observability.

**Project feed**
- 7-day timeline on the project home: new articles (from news-ingest), completed tasks, recent calls, new insights.
- Articles expose a one-click "Save to Resources" to promote into the curated library.

---

## Highlights

Things in here that aren't standard CRUD work, with file pointers:

- **Anti-hallucination guardrail on LLM extraction** - proposed citations are rejected unless the URL appears verbatim in the search results we showed the model. ([`src/lib/wiki/lint/imputation.ts`](src/lib/wiki/lint/imputation.ts) - `parseProposal`)
- **Native Anthropic tool-use loop** - multi-turn tool execution with provider fallthrough (non-Anthropic providers get plain chat). Tool calls persisted and surfaced inline in chat. ([`src/lib/llm-tool-loop.ts`](src/lib/llm-tool-loop.ts), [`src/lib/assistant-tools.ts`](src/lib/assistant-tools.ts))
- **Persona-aware system prompts** - five personas, single registry, single prompt builder. Persona stored per conversation. ([`src/lib/personas.ts`](src/lib/personas.ts), [`src/lib/lead-expert.ts`](src/lib/lead-expert.ts))
- **Resource retrieval composes with wiki retrieval** - same keyword-scoring shape, weighted with `userNote` highest. Wired into Assistant, outreach draft, and meeting prep. ([`src/lib/resources/retrieve.ts`](src/lib/resources/retrieve.ts))
- **Content-hashed, versioned wiki document store** - every page is immutable, deduped by hash, with `supersededById` chaining and full history. ([`src/lib/wiki/store.ts`](src/lib/wiki/store.ts))
- **Idempotent fact-apply** - accepting a proposal upserts a bullet under a structured `## Facts` section; re-running is a no-op, same field with a new value replaces in place. ([`src/lib/wiki/lint/imputation.ts`](src/lib/wiki/lint/imputation.ts) - `upsertFactsSection`)
- **Pluggable search + LLM providers via DI** - `WebSearchProvider` and `LLMFn` interfaces; tests inject `StubSearchProvider` and a fake LLM. No network in the test path. ([`src/lib/wiki/lint/search.ts`](src/lib/wiki/lint/search.ts))
- **Scope-driven incremental compile** - orchestrator supports `call`, `lead`, `company`, `topic`, `all` scopes. ([`src/lib/wiki/compile.ts`](src/lib/wiki/compile.ts))
- **Pure-function lead scoring** - 0-100 score, weighted factors, deterministic. ([`src/lib/scoring.ts`](src/lib/scoring.ts))
- **Best-effort OG metadata fetcher** - native fetch + regex, 5s timeout, 1MB cap, never throws. ([`src/lib/og-fetch.ts`](src/lib/og-fetch.ts))

---

## Architecture: the wiki AI pipeline

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
                            │  • web search per field                  │
                            │  • Claude extracts (JSON, URL allowlist) │
                            │  • persist as MISSING_DATA findings      │
                            └────────────────────┬─────────────────────┘
                                                 │
                            ┌────────────────────▼─────────────────────┐
                            │  UI: triage panel on company wiki page   │
                            │  Apply → upsert under ## Facts, new ver. │
                            └──────────────────────────────────────────┘
```

## Architecture: the assistant turn

```
   User message on /projects/[id]
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │  buildLeadExpertSystemPrompt(projectIds,    │
   │     query, persona)                         │
   │  → base prompt + persona addendum +         │
   │    project context + wiki retrieval +       │
   │    resource retrieval                       │
   └────────────────────┬────────────────────────┘
                        │
                        ▼
   ┌─────────────────────────────────────────────┐
   │  runAssistantWithTools (Anthropic native)   │
   │  loops: tool_use → execute → tool_result    │
   │  tools: create_note · create_task ·         │
   │         record_metric · save_resource       │
   └────────────────────┬────────────────────────┘
                        │
                        ▼
   AssistantMessage row { content, sources, toolCalls }
                        │
                        ▼
   Breadcrumbs + answer rendered in chat
```

Every step is independently invocable via REST endpoints under `src/app/api/`.

---

## Setup

```bash
git clone https://github.com/ShuklaA11/Forge.git
cd Forge
npm install --legacy-peer-deps
docker compose up -d                 # PostgreSQL on :5433
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5433/lead_management"' > .env
npx prisma migrate dev
npm run dev
```

Open the dev URL → Settings → add an Anthropic or OpenAI key. Tool-use (writes from chat) currently requires Anthropic.

**Tests:** `npm run test` (Vitest, no DB / network - provider stubs).

**Scheduler note:** Background agents (pipeline-health, icp-refiner, news-ingest) start with the Next dev/prod server via `instrumentation.ts`. Disable with `AGENT_SCHEDULER_DISABLED=1`.

---

## Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Turbopack) |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma |
| UI | shadcn/ui + Tailwind |
| LLM | Anthropic Claude (default, required for tool-use) · OpenAI · Ollama |
| Transcription | OpenAI Whisper |
| Scheduling | `node-cron` (wired in `instrumentation.ts`) |
| Tests | Vitest |
| Search | Pluggable `WebSearchProvider` (DuckDuckGo default) |

---

## Where to look

| Concern | File |
|---|---|
| Schema (all entities, all relations) | [`prisma/schema.prisma`](prisma/schema.prisma) |
| Per-project assistant home | [`src/app/projects/[projectId]/page.tsx`](src/app/projects/[projectId]/page.tsx) |
| Chat component (reusable across surfaces) | [`src/components/assistant-chat.tsx`](src/components/assistant-chat.tsx) |
| Assistant API route | [`src/app/api/assistant/route.ts`](src/app/api/assistant/route.ts) |
| Persona registry | [`src/lib/personas.ts`](src/lib/personas.ts) |
| System prompt builder | [`src/lib/lead-expert.ts`](src/lib/lead-expert.ts) |
| Tool registry (create_note / create_task / record_metric / save_resource) | [`src/lib/assistant-tools.ts`](src/lib/assistant-tools.ts) |
| Anthropic tool-use loop | [`src/lib/llm-tool-loop.ts`](src/lib/llm-tool-loop.ts) |
| Resource retrieval | [`src/lib/resources/retrieve.ts`](src/lib/resources/retrieve.ts) |
| Wiki retrieval | [`src/lib/wiki/retrieve.ts`](src/lib/wiki/retrieve.ts) |
| Wiki versioned store + hash dedup | [`src/lib/wiki/store.ts`](src/lib/wiki/store.ts) |
| Wiki compile orchestrator | [`src/lib/wiki/compile.ts`](src/lib/wiki/compile.ts) |
| Imputation pipeline + apply | [`src/lib/wiki/lint/imputation.ts`](src/lib/wiki/lint/imputation.ts) |
| Scheduler + cron jobs | [`src/lib/agents/scheduler.ts`](src/lib/agents/scheduler.ts) |
| Agent runtime (Zod + retry) | [`src/lib/agents/runtime.ts`](src/lib/agents/runtime.ts) |
| News ingest agent | [`src/lib/agents/news-ingest.ts`](src/lib/agents/news-ingest.ts) |
| Project feed | [`src/components/project-feed.tsx`](src/components/project-feed.tsx) |
| Lead scoring (pure function) | [`src/lib/scoring.ts`](src/lib/scoring.ts) |
| LLM provider abstraction | [`src/lib/llm.ts`](src/lib/llm.ts) |
| OG fetch helper | [`src/lib/og-fetch.ts`](src/lib/og-fetch.ts) |

---

## License

Private project.
