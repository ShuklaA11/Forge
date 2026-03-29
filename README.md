# LeadFlow

A local-first lead management system for tracking sales pipelines, logging calls, scoring leads, and drafting AI-powered outreach messages.

Built with Next.js 14, PostgreSQL, Prisma, and Ollama for local LLM inference.

## Features

### Lead Management
- **Project-based lead organization** — Group leads by campaign (e.g., "Q1 SMB Outreach", "SBA Lending")
- **Company-grouped views** — Leads are grouped by company with collapsible sections showing contact count, call count, and average score
- **Pipeline tracking** — Move leads through stages: Researched, Contacted, Responded, Meeting Booked, Proposal Sent, Closed Won/Lost
- **Conversation stages** — Track relationship depth separately: Lead → Intro Call → Demo → Pilot → Closed
- **Lead scoring** — Automatic 0-100 priority scores based on engagement recency, pipeline stage, decision-maker level, company size, follow-up urgency, and channel responsiveness
- **Touchpoint logging** — Track every interaction (email, call, LinkedIn DM) with timestamps and direction
- **Outreach sequences** — Multi-step follow-up cadences with configurable intervals

### Call Tracking & AI Notes
- **Audio upload** — Upload m4a or mp4 recordings from voice memos or Google Meet/Zoom
- **Whisper transcription** — Automatic transcription via OpenAI Whisper API (~$0.12/call)
- **AI-structured notes** — Claude extracts summary, key points, objections, validation signals, commitments, and sentiment from each call
- **Manual notes** — Log notes for calls you couldn't record, still get AI-structured extraction
- **Conversation stage tracking** — Automatically surfaces where each lead relationship stands

### AI Features
- **AI message drafting** — Generate personalized outreach messages using lead context, touchpoint history, and campaign goals
- **AI lead research** — Describe your ideal customer and get ICP definitions, search strategies, and outreach angles
- **Web search integration** — LangChain agent with DuckDuckGo search lets the AI pull real company data and industry info
- **Bulk CSV import** — Import leads from spreadsheets with field mapping

### Other
- **API key masking** — Keys are hidden after save, only last 4 characters shown
- **No auth required** — Single-user, runs entirely on your machine

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, Server Components) |
| Database | PostgreSQL 16 via Docker |
| ORM | Prisma |
| UI | shadcn/ui + Tailwind CSS |
| LLM | Ollama (Qwen 3.5, Llama, etc.) / Anthropic / OpenAI |
| Transcription | OpenAI Whisper API |
| AI Agents | LangChain + LangGraph (ReAct agent with web search) |

## Prerequisites

- **Node.js** >= 20
- **Docker** (for PostgreSQL)
- **Ollama** (for local LLM — optional if using Anthropic/OpenAI API keys)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/ShuklaA11/LeadFlow.git
cd LeadFlow
npm install --legacy-peer-deps
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts PostgreSQL on port `5433` with database `lead_management`.

### 3. Configure environment

Create a `.env` file:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/lead_management"
```

No API keys are needed if using Ollama. For cloud LLMs, configure keys in the app's Settings page.

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## LLM Configuration

LeadFlow supports three LLM providers, configurable in **Settings**:

### Ollama (Local — recommended)

No API key needed. Install and pull a model:

```bash
brew install ollama
ollama pull qwen3.5:4b
ollama serve
```

The app connects to Ollama at `http://localhost:11434`. Currently configured to use `qwen3.5:4b`.

### Anthropic / OpenAI

Enter your API key in Settings. Uses `claude-sonnet-4-20250514` (Anthropic) or `gpt-4o` (OpenAI).

### Web Search

Enable the **Web Search** toggle in Settings (Ollama only). This gives the AI access to DuckDuckGo search via a LangChain ReAct agent, so it can look up real company info, recent news, and industry data when drafting messages or researching leads.

## Project Structure

```
src/
  app/
    api/
      calls/          # Call upload, transcription, note generation
      leads/          # CRUD + bulk import
      llm/draft/      # AI message drafting
      llm/research/   # AI lead research
      projects/       # Project CRUD
      scoring/        # Lead score recalculation
      settings/       # App configuration (API key masking)
      summaries/      # Summary generation endpoints
      touchpoints/    # Interaction logging
    leads/[id]/       # Lead detail page (calls, notes, stage)
    projects/         # Project list + detail pages
    settings/         # Settings page (voice config)
  components/
    ui/               # shadcn/ui base components
    call-list         # Call history per lead
    call-logger       # Audio upload + manual notes form
    company-group     # Collapsible company section on leads page
    email-composer    # AI-powered email drafting dialog
    lead-edit-dialog  # Edit lead contact info
    stage-updater     # Pipeline stage selector
    conversation-stage-updater  # Conversation depth tracker
    sidebar           # App navigation
  lib/
    call-notes.ts     # AI-structured note extraction
    company-summary.ts # Company-level rolling summaries
    db.ts             # Prisma client singleton
    llm.ts            # LLM provider abstraction (Anthropic/OpenAI/Ollama)
    llm-agent.ts      # LangChain agent with DuckDuckGo web search
    project-summary.ts # Project-level cross-company summaries
    scoring.ts        # Lead priority scoring engine
    transcription.ts  # OpenAI Whisper transcription
    utils.ts          # Date formatting helpers
  types/
    index.ts          # Shared TypeScript enums and label maps
prisma/
  schema.prisma       # Database schema
docker-compose.yml    # Local PostgreSQL container
```

## Pipeline Stages

`Researched` → `Contacted` → `Responded` → `Meeting Booked` → `Proposal Sent` → `Closed Won` / `Closed Lost`

## Lead Scoring

Scores range from 0-100, calculated from weighted factors:

| Factor | Weight |
|--------|--------|
| Engagement recency | 30% |
| Pipeline stage | 25% |
| Decision-maker level | 15% |
| Company size | 10% |
| Follow-up urgency | 10% |
| Channel responsiveness | 10% |

Scores recalculate automatically when touchpoints are logged or stages change.

## License

Private project.
