# AI Interview Prep Kit

Turns a pasted job description + a company website URL into a structured, editable interview
preparation kit: a company brief, a role breakdown, a categorised question bank with a coverage
guarantee, flashcards, and a day-by-day study schedule. Users register, create kits, watch them
generate with live progress, reshape any part of the result, and practise against the flashcards.

A plain-language walkthrough in Hindi/Hinglish (same content, written for a non-technical read, plus
a step-by-step "where do I click, what do I upload" deployment guide) is at
[`README.hinglish.md`](README.hinglish.md).

## Tech stack

| Layer      | Choice                              |
|------------|--------------------------------------|
| Frontend   | Next.js (App Router) + Tailwind CSS |
| Backend    | Node.js + Express + TypeScript      |
| Database   | MongoDB (Mongoose)                  |
| Shared types | Zod schema in `packages/shared`, consumed as source by both frontend and backend |
| LLM        | Google Gemini (`gemini-flash-lite-latest`) — see [LLM provider](#llm-provider--model) |
| Scraping   | `cheerio` for HTML parsing, a hand-rolled crawler (no headless browser) |

## Repo layout

frontend/           Next.js + Tailwind UI
backend/             Express API: auth, the research/generation pipeline, persistence, and the
                     batch `evaluate` CLI
packages/shared/     Zod schema + TypeScript types for the kit structure (Appendix A / B),
                     imported as source by both frontend and backend
render.yaml          Render Blueprint for deploying the backend

## Setup — local development

Prerequisites: Node.js 20+, a MongoDB connection string (local `mongod` or a free MongoDB Atlas
cluster), and a free Gemini API key.

```bash
npm install                                   

cp backend/.env.example backend/.env         
cp frontend/.env.example frontend/.env.local  

npm run dev:backend     # http://localhost:4000
npm run dev:frontend     # http://localhost:3000
```

Every backend env var is documented inline in `backend/.env.example`; the frontend's single env var
is documented in `frontend/.env.example`.

Run the test suite:
npm test               

## Setup — the batch entry point (mandatory, Section 9)

This needs no database and no frontend — it runs the same pipeline the live app uses, straight
against the filesystem:

```bash
cd backend
npm install                                    
cp .env.example .env                           
npm run evaluate -- --input <cases.json> --output <kits.json>
```

From a clean clone, the exact sequence is:

```bash
git clone <repo-url>
cd <repo>
npm install
cp backend/.env.example backend/.env           # set GEMINI_API_KEY
npm run evaluate -- --input backend/test-fixtures/example-cases.json --output kits.out.json
```

## LLM provider & model

**Google Gemini**, model `gemini-flash-lite-latest` (`backend/src/llm/client.ts`,
`backend/src/config/env.ts`):
- Free tier with no card required (`https://aistudio.google.com/apikey`).
- `-latest` is a rolling alias, so it never 404s when Google retires an old snapshot.
- The "lite" tier returned far fewer `503` "high demand" errors than the newest flash tier in testing.

Every call goes through `backend/src/llm/rateLimiter.ts`, which retries with exponential backoff +
jitter on 429/5xx/transient failures (5 retries, 2s base delay).


- **Auth**: `backend/src/auth/` + `backend/src/routes/auth.ts`. Registration hashes passwords with
  bcrypt; login issues a signed JWT stored in an httpOnly cookie (`backend/src/auth/jwt.ts`);
  `requireAuth` middleware gates every kit route and returns `401` on a missing/invalid/expired
  token, which the frontend's `AuthGate` treats as "redirect to `/login`" rather than showing a
  broken page.
- **Kits are strictly per-user**: every kit query in `backend/src/routes/kits.ts` filters by
  `{ _id, userId }` from the authenticated session — there's no code path that can read or mutate
  another user's kit, not even by guessing an id.
- **Persistence**: `backend/src/db/models/Kit.ts`. A kit document tracks its own pipeline status
  (`queued → extracting → researching → generating_questions → checking_coverage → scheduling →
  ready | failed`), a `progressLog`, and the original `input`. The generated kit content is stored as
  `Mixed` and validated against the Zod schema on every write (`assertValidKit`).
- **Generation is async and queued**: `backend/src/jobQueue.ts` is a simple in-process FIFO queue.
  `POST /api/kits` returns immediately with `status: "queued"`; the frontend polls
  `GET /api/kits/:id` (~every 1.5–2s) for live progress — see [Limitations](#known-limitations).
- **Retrieval, extraction, generation, scheduling, and persistence are separate modules** —
  `backend/src/pipeline/*.ts` for research/generation, `backend/src/lib/scheduler.ts` +
  `backend/src/lib/coverage.ts` for the two deterministic steps, `backend/src/db/*` for persistence.

## Retrieval approach & sources used

Two independent sources feed the kit, both accessed for research purposes on publicly available
pages, with `robots.txt` respected:

1. **The company's own site** (`backend/src/pipeline/crawler.ts`): fetch the homepage, extract every
   same-site link, score each by keyword + path-depth heuristics (`careers`, `jobs`, `hiring`,
   `handbook`, `engineering`, `about`, etc. — see `KEYWORD_WEIGHTS`), and fetch the top-ranked
   candidates (capped at 6 pages total).
2. **Public discussion of the company's interview process**
   (`backend/src/pipeline/discussionSearch.ts`): a best-effort search against DuckDuckGo's key-less
   HTML results endpoint for `"<company> interview process"`. Finding nothing is treated as a valid
   outcome, and the resulting kit says so rather than fabricating a hiring process.

Every fetch goes through a single choke point (`backend/src/pipeline/fetchLimited.ts`) with a politeness
delay between requests and exponential-backoff retry on `429`/`5xx`/timeouts. A page that still can't
be retrieved after retries is recorded in `skipped` with a reason and the crawl continues.

## How the research/generation steps are sequenced

`backend/src/pipeline/runPipeline.ts` is the single entry point both the live API and the batch CLI
call, in this order:

1. **Extract requirements** from the pasted JD (`extractRequirements.ts`) — also derives
   `role.seniority` and `role.responsibilities` in the same call.
2. **Crawl the company site** (`crawler.ts`).
3. **Search for public interview discussion** (`discussionSearch.ts`).
4. **Write the company brief** (`companyBrief.ts`) from the crawled pages.
5. **Generate questions per category, separately** (`generateQuestions.ts`) — technical, behavioural,
   system-design, and company-fit questions each get their own instructions/context.
6. **Check coverage and close gaps** — deterministic, not delegated to the model (see next section).
7. **Build the schedule and generate flashcards** — the schedule allocator is pure arithmetic (see
   below); flashcards are generated from the finalised requirement set.

## The second pass — coverage loop

`backend/src/lib/coverage.ts` computes, in code, which requirements have zero questions referencing
their id in `requirement_ids`. Any gap triggers a second generation pass scoped to exactly those gap
ids (`generateGapFillQuestions`), then the check runs again.

**Stop conditions**: the loop stops when either every requirement is covered, a pass makes zero
additional progress (`"stalled"`), or a configured max-passes ceiling is hit (`"max_passes_reached"`).
The kit's `coverage.status`/`coverage.reason`/`coverage.uncovered_requirement_ids` report the real
outcome rather than pretending everything was covered.

## The kit structure & extensions

`packages/shared/src/kitSchema.ts` is the single source of truth, matching Appendix A's field names
exactly. The only additions are `origin: "ai" | "user"` and `edited: boolean` on `questions`,
`flashcards`, and `company_brief` — see [state model](#generated-edited-and-pinned-state) below — and
a richer `coverage` object (`status`, `reason`, a `must`/`nice` breakdown) alongside the two required
fields (`uncovered_requirement_ids`, `passes`).

## Generated, edited, and pinned state

A single rule applied uniformly everywhere, rather than a separate "pinned" concept layered on top:

> An item survives a regeneration if a human touched it — either because they wrote it
> (`origin: "user"`) or edited it (`edited: true`). (`isLocked()` in `backend/src/server/regenerate.ts`.)

Concretely:
- Editing a question/flashcard's fields sets `edited: true` on that item, permanently.
- Moving a question to a different category also sets `edited: true`.
- Adding a question/flashcard by hand sets `origin: "user"`.
- **Regenerating one question category**: only the *un-locked* questions in that category are
  discarded and replaced; every locked question (in that category) is kept as-is. Coverage and the
  schedule are always recomputed afterward.
- **Regenerating the company brief**: the brief is one atomic section, so "regenerate the brief"
  always fully replaces it (see `regenerateCompanyBrief` in `regenerate.ts`). It only refetches the
  brief's already-known source pages (no re-crawl).
- **Regenerating the schedule** just re-runs the deterministic allocator against whatever questions
  currently exist.
- The frontend badges every AI- vs user-authored/edited item in the UI.

## Schedule allocation (Section 8)

`backend/src/lib/scheduler.ts` — pure arithmetic, no LLM call:

1. Every question gets a priority score (2 = covers a must-have requirement, 1 = covers a nice-to-have,
   0 = neither) and a fixed per-difficulty time estimate (8/15/25 minutes for difficulty 1/2/3).
2. Questions are sorted priority desc, then difficulty desc, with original order as a stable tie-break.
3. Each day gets a target-minutes capacity, front-loaded: the first ~60% of days get 20% more capacity
   than the rest. A single-day schedule gets one large capacity bucket instead.
4. Must-priority questions are placed first and are **never dropped** even if they exceed a day's
   capacity — they only spill onto a later day. Nice/general questions fill remaining room the same
   way and may legitimately go unscheduled if there's truly no room.
5. The result always has exactly `days` entries with integer `minutes` (no floats) and each
   `question_ids` entry only ever references a question id that exists in the input list.

Both `runPipeline.ts` (first pass) and `regenerate.ts` (after any edit that changes the question set)
call the exact same function.

## Edge cases & failure handling (Section 10)

| Case | Handling |
|---|---|
| Invalid/404/timeout company URL | `assertPublicHttpUrl` rejects malformed URLs and non-http(s) schemes up front; a hard failure (`COMPANY_UNREACHABLE`) only when the homepage itself can't be fetched at all |
| No discoverable hiring/about page | The link-ranking crawl simply returns fewer pages; `source.pages_used` reflects what was actually available |
| Thin, two-line JD | `extractRequirements` returns few or zero requirements rather than inventing any |
| Public discussion turns up nothing | `discussionSearch` returns `[]`; the pipeline proceeds without fabricating a hiring process |
| Model returns invalid JSON / an incomplete kit | Every LLM call is parsed defensively with retry (`llm/client.ts`); the final candidate kit is always run through `assertValidKit` (Zod) before being saved |
| LLM provider rate-limits or briefly fails | `llm/rateLimiter.ts` retries 429/5xx with exponential backoff + jitter before giving up |
| Same description + company submitted twice | `dedupeHash(jd, companyUrl)` is unique per user (`Kit` model's compound index); re-submitting returns the existing kit id with `duplicate: true` |
| 1-day or 60-day schedule request | The scheduler's day-count is driven entirely by the requested `days`; a 1-day schedule uses a single large capacity bucket, a 60-day one produces 60 (mostly light) days |

## Security (Section 11)

- `backend/src/security/urlGuard.ts`: rejects malformed URLs and non-http(s) schemes always; in
  production (`NODE_ENV=production`), also resolves the hostname's DNS and rejects private/loopback/
  link-local ranges (RFC1918, `127.0.0.0/8`, `169.254.0.0/16` including the cloud metadata address,
  IPv6 equivalents).
- `fetchLimited.ts` enforces a response size cap and only follows the crawl for `http`/`https`
  same-site links (`isSameSite`).
- Fetched page text and the pasted JD are both treated as inert content passed into a prompt, never
  as instructions — `backend/src/llm/prompts/untrusted.ts` wraps every untrusted block with explicit
  delimiters and an instruction to treat its contents as data only.

## Known limitations

- The generation job queue is a simple in-process array (`jobQueue.ts`) — a backend process restart
  mid-generation leaves that one kit stuck at whatever status it last reached, rather than resuming.
  A production version would use a durable queue (e.g. BullMQ + Redis).
- Public "interview discussion" search depends on scraping DuckDuckGo's HTML results page — more
  fragile than an official API and could break if DuckDuckGo changes its markup; degrades to an
  honest empty result rather than crashing the pipeline.
- Company-brief regeneration only re-fetches its already-known source pages, not a fresh crawl.

## Deployment

Deployed as three free-tier services: **Vercel** (frontend), **Render** (backend), **MongoDB Atlas**
(database). Full click-by-click steps — including exactly what to upload/connect where — are in
[`README.hinglish.md`](README.hinglish.md#deployment-step-by-step). In short:

1. **MongoDB Atlas**: create a free (M0) cluster, add a database user, allow access from anywhere
   (`0.0.0.0/0`), copy the connection string into `MONGODB_URI`.
2. **Render** (backend): new Web Service from this repo (`render.yaml` at the repo root configures
   build/start commands for you — Render detects it automatically as a Blueprint). Set
   `MONGODB_URI`, `GEMINI_API_KEY`, and `FRONTEND_ORIGIN` (the Vercel URL from step 3) in the
   dashboard; `JWT_SECRET` is auto-generated by the blueprint.
3. **Vercel** (frontend): import this repo, set the project's Root Directory to `frontend`, set
   `NEXT_PUBLIC_API_URL` to the Render backend's public URL, deploy.
4. Go back to Render and confirm `FRONTEND_ORIGIN` exactly matches the final Vercel URL (no trailing
   slash) — CORS + the session cookie both depend on this matching exactly.
