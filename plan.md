# Plan: Integrate Voice Call Tracking & AI-Structured Notes

## Context

You're having 15-20 min calls with leads and want to track conversations, extract structured insights via AI, and inform next steps. This integrates directly into the lead management app since the domain (tracking lead relationships through a pipeline) is identical.

## Design Decisions

- **Stages**: Keep existing `PipelineStage` for outreach. Add new `conversationStage` on Lead for call progression (lead -> intro_call -> demo -> pilot -> closed)
- **Data model**: New `Call` model linked to Lead (not extending Touchpoint). Each Call auto-creates a Touchpoint for the activity timeline
- **Storage**: Audio files stored locally in `/uploads/` directory
- **Transcription**: OpenAI Whisper API (~$0.12/call)
- **Notes generation**: Existing LLM provider (via `src/lib/llm.ts`)

---

## Phase 1 — Core (MVP)

### Sub-task 1: Schema Changes
**Files**: `prisma/schema.prisma`, `src/types/index.ts`

Add to schema:
- `ConversationStage` enum: `LEAD | INTRO_CALL | DEMO | PILOT | CLOSED`
- `CallSentiment` enum: `VERY_POSITIVE | POSITIVE | NEUTRAL | NEGATIVE | VERY_NEGATIVE`
- `Call` model: id, leadId, title, callDate, durationMinutes?, audioFilePath?, transcript?, manualNotes?, structuredNotes (Json?), sentiment?, sentimentScore (Float?), touchpointId?, timestamps. Indexes on leadId, callDate DESC
- `CallAnnotation` model: id, callId, key, value, timestamp?, createdAt
- Add `conversationStage ConversationStage @default(LEAD)` and `calls Call[]` to Lead
- Add `openaiApiKey String @default("")` to Settings (Whisper needs OpenAI regardless of LLM provider)

Add to types: new enum labels, `CONVERSATION_STAGES_ORDERED`, `StructuredNotes` interface

### Sub-task 2: Call CRUD API
**Files**: `src/app/api/calls/route.ts` (new), `src/app/api/calls/[id]/route.ts` (new)

- `GET /api/calls?leadId=xxx` — list calls for a lead
- `POST /api/calls` — create call + auto-create Touchpoint (channel: PHONE, type: MEETING) + recalculate score
- `GET/PUT/DELETE /api/calls/[id]` — single call operations

### Sub-task 3: Audio Upload
**Files**: `src/app/api/calls/upload/route.ts` (new), `next.config.ts`

- Accept multipart FormData (m4a/mp4/wav/webm), write to `/uploads/{leadId}/{timestamp}-{filename}`
- Validate type + size (cap 25MB — Whisper API limit)
- Configure body size limit in next.config.ts
- Add `/uploads` to `.gitignore`

### Sub-task 4: Whisper Transcription
**Files**: `src/lib/transcription.ts` (new)

- `transcribeAudio(filePath): Promise<string>` — reads file, POSTs to OpenAI Whisper API
- Reads `openaiApiKey` from Settings table

### Sub-task 5: AI Structured Notes
**Files**: `src/lib/call-notes.ts` (new)

- `generateStructuredNotes(transcript, leadContext): Promise<StructuredNotes>`
- Uses existing `generateLLMResponse` from `src/lib/llm.ts`
- Returns JSON: summary, keyPoints, quotes, objections, validationSignals, commitments, nextSteps, sentiment, sentimentScore
- Works with both full transcripts and short manual notes

### Sub-task 6: Processing Pipeline
**Files**: `src/app/api/calls/process/route.ts` (new)

- `POST /api/calls/process { callId }` — orchestrates: transcribe audio -> generate structured notes -> update Call record -> update Touchpoint body with summary
- Synchronous for MVP (30-60s for a 20-min call)

### Sub-task 7: Call Logger Dialog
**Files**: `src/components/call-logger.tsx` (new)

- Follows `email-composer.tsx` Dialog pattern exactly
- Two modes: with recording (upload + process) or without (manual notes + generate)
- Shows structured notes preview after processing, editable before final save
- Loading states for each step (uploading, transcribing, generating notes)

### Sub-task 8: Lead Detail Page Integration
**Files**: `src/app/leads/[id]/page.tsx`, `src/components/call-list.tsx` (new)

- Add shadcn Tabs: "Overview" (existing content) + "Calls" (new call list)
- Add CallLogger button in header next to EmailComposer
- Add conversationStage display
- Include `calls` in Prisma query
- CallList: cards with title, date, duration, sentiment badge, expandable structured notes

### Sub-task 9: Conversation Stage Updater
**Files**: `src/components/conversation-stage-updater.tsx` (new), `src/app/api/leads/[id]/route.ts`

- Dropdown component (same pattern as `stage-updater.tsx`)
- Ensure PATCH handler accepts `conversationStage` field

### Build Order
1 (schema) -> 2 (CRUD) -> 3,4,5 in parallel (upload, transcription, notes libs) -> 6 (pipeline) -> 9 (stage updater) -> 7 (dialog) -> 8 (page integration)

---

## Phase 2 — Intelligence

### Sub-task 1: Rolling Company Summary
- New `src/lib/company-summary.ts` — fetches all calls for leads at a company, generates cumulative summary via LLM
- New API endpoint, triggered after each new call is processed

### Sub-task 2: Sentiment Trend
- Add inline sparkline (simple SVG, no charting lib) to call-list.tsx showing sentiment over time
- Add stats aggregation to GET /api/calls

### Sub-task 3: Context-Aware Notes
- Modify `src/lib/call-notes.ts` — use project `campaignStage` to shape the AI lens (IDEATION = problem-fit signals, ACTIVE = buying signals, etc.)

### Sub-task 4: Notes Build on Prior Calls
- Modify `src/lib/call-notes.ts` — include last 3 calls' summaries in prompt context so AI tracks evolution of objections, topics, momentum

---

## Phase 3 — Search & Chat

### Sub-task 1: Full-Text Search
- PostgreSQL `tsvector` + GIN index on Call.transcript via raw SQL migration
- New `GET /api/calls/search?q=xxx` endpoint using `prisma.$queryRaw` with `to_tsquery`

### Sub-task 2: Search UI
- New `src/components/call-search.tsx` — search input with filtered results, highlighted excerpts

### Sub-task 3: Scoped Chat
- New chat endpoint accepting scope (callId, leadId, projectId) — fetches relevant call data as LLM context
- New `src/components/call-chat.tsx` — follows existing assistant chat pattern

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Whisper 25MB file limit | Validate on upload, show clear error. Phase 2: add ffmpeg compression |
| Processing takes 30-60s | Loading spinner for MVP. Phase 2: background queue + polling |
| LLM returns malformed JSON | Strip markdown code blocks, validate keys, fallback to raw text |
| 20-min transcript (~4k words) | Well within Claude's context window. Monitor token usage |

## Verification

After each sub-task:
1. Run `npx prisma migrate dev` (schema changes)
2. Test API endpoints via curl/browser
3. Verify Lead detail page renders calls tab correctly
4. Test full flow: upload m4a -> transcription -> structured notes -> view on lead page
5. Test manual notes flow: enter notes -> generate structured notes -> view
