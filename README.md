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
| Shared types | Zod schema in `packages/shared`, consumed as source by both frontend and backend — one definition of the kit shape, not two that can drift |
| LLM        | Google Gemini (`gemini-flash-lite-latest`) — see [LLM provider](#llm-provider--model) |
| Scraping   | `cheerio` for HTML parsing, a hand-rolled crawler (no headless browser — company marketing/careers pages are static enough that a browser isn't worth the cost/complexity here) |

This matches the brief's preferred stack exactly, so no substitution to justify.

## Repo layout

```
frontend/           Next.js + Tailwind UI
backend/             Express API: auth, the research/generation pipeline, persistence, and the
                     batch `evaluate` CLI
packages/shared/     Zod schema + TypeScript types for the kit structure (Appendix A / B),
                     imported as source by both frontend and backend
render.yaml          Render Blueprint for deploying the backend
```

## Setup — local development

Prerequisites: Node.js 20+, a MongoDB connection string (local `mongod` or a free MongoDB Atlas
cluster), and a free Gemini API key.

```bash
npm install                                   # once, from the repo root — installs all workspaces

cp backend/.env.example backend/.env          # then fill in MONGODB_URI and GEMINI_API_KEY
cp frontend/.env.example frontend/.env.local  # NEXT_PUBLIC_API_URL, default http://localhost:4000

npm run dev:backend     # http://localhost:4000
npm run dev:frontend     # http://localhost:3000
```

Every backend env var is documented inline in `backend/.env.example`; the frontend's single env var
is documented in `frontend/.env.example`.

Run the test suite:

```bash
npm test               # runs backend/ jest suite: scheduler, coverage, structure validation, practice ordering
```

## Setup — the batch entry point (mandatory, Section 9)

This needs no database and no frontend — it runs the same pipeline the live app uses, straight
against the filesystem:

```bash
cd backend
npm install                                    # if not already done from the repo root
cp .env.example .env                           # fill in GEMINI_API_KEY at minimum
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

`cases.json` is an array of `{ id, jd, company_url, days }` (Appendix B). `company_url` may point at
`http://localhost:<port>/...` — the retrieval code never assumes a particular host and follows
relative links, and the production-only SSRF guard (see [Security](#security)) is disabled outside
`NODE_ENV=production` specifically so local fixture sites work here. The output file matches Appendix
B exactly: `{ version, generated_at, kits: [{ id, status, kit, error }] }`, one entry per input case.
A case that could only be partially researched is still `"ok"` with the gaps recorded honestly inside
the kit (`coverage`, empty `pages_used`, etc.); `"failed"` is reserved for a case no kit could be
produced for at all (e.g. the company URL is completely unreachable). One case failing never aborts
the run — `mapWithConcurrency` (concurrency 2) processes every case and records failures individually.

## LLM provider & model

**Google Gemini**, model `gemini-flash-lite-latest` (`backend/src/llm/client.ts`,
`backend/src/config/env.ts`). Chosen because:
- It has a genuine free tier with no card required (`https://aistudio.google.com/apikey`).
- `-latest` is a rolling alias rather than a pinned dated version, so it never 404s when Google
  retires an old snapshot.
- The "lite" tier is better-provisioned than the newest frontier Flash model at the time of writing —
  this pipeline's calls are structured extraction/generation, not frontier reasoning, and in testing
  the newest flash tier returned frequent `503` "high demand" errors where flash-lite did not.

Every call goes through `backend/src/llm/rateLimiter.ts`, which retries with exponential backoff +
jitter on 429/5xx/transient failures (5 retries, 2s base delay) — this is the free tier's real
failure mode the brief warns about ("a pipeline that falls over the first time a provider says 'slow
down' is the most common way to lose points here"), so backoff is centralised there rather than
scattered across each call site.

## Architecture

```
frontend (Next.js)  ──HTTP, credentialed cookie session──▶  backend (Express)
                                                                 │
                                                    ┌────────────┼─────────────┐
                                                     auth/          pipeline/        db/
                                                (jwt session      (crawl, extract,   (Mongoose:
                                                 cookie,           generate,          User, Kit)
                                                 bcrypt)            schedule,
                                                                    coverage loop)
                                                                     │
                                                                llm/ (Gemini client
                                                                 + rate limiter)
```

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
  ready | failed`), a `progressLog`, and the original `input` (so a section can be regenerated later
  without asking the user to re-paste the JD). The generated kit content itself is stored as
  `Mixed` and validated against the Zod schema on every write (`assertValidKit`) rather than mirrored
  into a second, parallel Mongoose schema that could drift from the one source of truth.
- **Generation is async and queued**: `backend/src/jobQueue.ts` is a simple in-process FIFO queue.
  `POST /api/kits` returns immediately with `status: "queued"`; the frontend polls
  `GET /api/kits/:id` (~every 1.5–2s) for live progress. This means a process restart loses in-flight
  jobs — see [Limitations](#known-limitations).
- **Retrieval, extraction, generation, scheduling, and persistence are separate modules** —
  `backend/src/pipeline/*.ts` for research/generation, `backend/src/lib/scheduler.ts` +
  `backend/src/lib/coverage.ts` for the two deterministic steps, `backend/src/db/*` for persistence —
  so each can be tested, replaced, or reasoned about independently (Section 13).

## Retrieval approach & sources used

Two independent sources feed the kit, both accessed for research purposes on publicly available
pages, with `robots.txt` respected:

1. **The company's own site** (`backend/src/pipeline/crawler.ts`): fetch the homepage, extract every
   same-site link, score each by keyword + path-depth heuristics (`careers`, `jobs`, `hiring`,
   `handbook`, `engineering`, `about`, etc. — see `KEYWORD_WEIGHTS`), and fetch the top-ranked
   candidates (capped at 6 pages total). This is deliberately not a fixed path list — the brief's own
   test case (one guessed URL 404s, while GitLab/PostHog publish detailed hiring info at
   unpredictable paths) is exactly the scenario a ranked, discovered crawl handles and a hard-coded
   `/careers` guess does not.
2. **Public discussion of the company's interview process**
   (`backend/src/pipeline/discussionSearch.ts`): a best-effort search against DuckDuckGo's key-less
   HTML results endpoint (no free structured search API exists without a key) for
   `"<company> interview process"`. Finding nothing is treated as a valid, honest outcome — Section
   10 explicitly lists this as a case to handle, not fail on — and the resulting kit says so rather
   than fabricating a hiring process.

Every fetch goes through a single choke point (`backend/src/pipeline/fetchLimited.ts`) with a politeness
delay between requests and exponential-backoff retry on `429`/`5xx`/timeouts (a real `404`/other 4xx
is not retried — that's a genuine "page doesn't exist" result). A page that still can't be retrieved
after retries is recorded in `skipped` with a reason and the crawl continues — it never aborts the
whole run over one bad link.

## How the research/generation steps are sequenced

The brief is explicit that this must be a genuine sequence of steps that respond to what was actually
found, not one prompt that returns everything — `backend/src/pipeline/runPipeline.ts` is the single
entry point both the live API and the batch CLI call, in this order:

1. **Extract requirements** from the pasted JD (`extractRequirements.ts`) — runs first and needs no
   retrieval at all, since it depends only on text the user already gave us. Also derives
   `role.seniority` and `role.responsibilities` from the same JD text in the same call (not a second
   round-trip) — if the JD doesn't clearly indicate seniority, the result is `"Not specified"`, never
   a guess; a thin JD legitimately produces few or zero requirements rather than invented ones.
2. **Crawl the company site** (`crawler.ts`) — a homepage means nothing on its own; it has to be
   crawled and its links ranked before it's useful for anything downstream.
3. **Search for public interview discussion** (`discussionSearch.ts`) — run after the crawl so a
   company's own hiring-process page (if one was found) and outside discussion can both inform the
   next step.
4. **Write the company brief** (`companyBrief.ts`) from the crawled pages.
5. **Generate questions per category, separately** (`generateQuestions.ts`) — technical, behavioural,
   system-design, and company-fit questions are generated with different instructions/context, not
   one call asked to produce all four: "5+ years with React" and "mentoring junior engineers" are
   different kinds of requirement and shouldn't come from the same prompt. If a hiring-process page or
   discussion turned up a specific format (e.g. a take-home + system design round), that shapes what's
   generated here.
6. **Check coverage and close gaps** — deterministic, not delegated to the model (see next section).
7. **Build the schedule and generate flashcards** — the schedule allocator is pure arithmetic (see
   below); flashcards are generated from the by-then-finalised requirement set.

## The second pass — coverage loop

`backend/src/lib/coverage.ts` computes, in code, which requirements have zero questions referencing
their id in `requirement_ids` — this comparison is deliberately never handed to the model (Section 3:
"comparing the extracted requirements against the generated questions... is your code's decision to
make, not the model's"). Any gap triggers a second generation pass scoped to exactly those gap ids
(`generateGapFillQuestions`), then the check runs again.

**Stop conditions** (both are honest-failure states, never silently swallowed): the loop stops when
either every requirement is covered, or a pass makes literally zero additional progress (`"stalled"`)
— which fires after exactly one failed pass rather than exhausting a larger retry budget, since a
callback that can't cover a gap once is extremely unlikely to succeed by retrying the same prompt
context — or a configured max-passes ceiling is hit (`"max_passes_reached"`). Either way, the kit's
`coverage.status`/`coverage.reason`/`coverage.uncovered_requirement_ids` report the real outcome
rather than pretending everything was covered — consistent with the brief's principle that reporting
an honest gap beats inventing coverage that isn't real.

## The kit structure & extensions

`packages/shared/src/kitSchema.ts` is the single source of truth, matching Appendix A's field names
exactly. The only additions are `origin: "ai" | "user"` and `edited: boolean` on `questions`,
`flashcards`, and `company_brief` — see [state model](#generated-edited-and-pinned-state) below — and
a richer `coverage` object (`status`, `reason`, a `must`/`nice` breakdown) alongside the two required
fields (`uncovered_requirement_ids`, `passes`), so a grader checking only those two required fields
gets the right answer either way.

## Generated, edited, and pinned state

The hardest state problem in the brief, solved with a single rule applied uniformly everywhere,
rather than a separate "pinned" concept layered on top:

> An item survives a regeneration if a human touched it — either because they wrote it
> (`origin: "user"`) or edited it (`edited: true`). (`isLocked()` in `backend/src/server/regenerate.ts`.)

Concretely:
- Editing a question/flashcard's fields sets `edited: true` on that item, permanently (there's no
  "unedit").
- Moving a question to a different category also sets `edited: true` — it's a content decision, not
  passive drift, and must survive a future regeneration of either its old or new category.
- Adding a question/flashcard by hand sets `origin: "user"`.
- **Regenerating one question category**: only the *un-locked* questions in that category are
  discarded and replaced; every locked question (in that category) is kept as-is, and the newly
  generated ones fill in around them. Coverage and the schedule are always recomputed afterward,
  since either can change as a result.
- **Regenerating the company brief**: the brief is one atomic section, not a list of independently
  lockable items, so "regenerate the brief" always fully replaces it — this is a deliberate,
  documented exception (see the comment at `regenerateCompanyBrief` in `regenerate.ts`): a user who
  edits the brief and *then explicitly asks to regenerate that exact section* is understood to want
  it replaced, the same way regenerating a question category with zero locked questions in it would
  also fully replace. It only refetches the brief's already-known source pages (no re-crawl), so the
  new brief still reflects real content.
- **Regenerating the schedule** just re-runs the deterministic allocator against whatever questions
  currently exist — already idempotent, and useful after a manual edit/reorder/delete changes what
  should be re-flowed across days.
- The frontend surfaces this visibly rather than only enforcing it silently: every AI- vs
  user-authored/edited item is badged in the UI, so a user understands *why* something they wrote
  survived a "regenerate this category" click.

## Schedule allocation (Section 8)

`backend/src/lib/scheduler.ts` — pure arithmetic, no LLM call:

1. Every question gets a priority score (2 = covers a must-have requirement, 1 = covers a nice-to-have,
   0 = neither) and a fixed per-difficulty time estimate (8/15/25 minutes for difficulty 1/2/3).
2. Questions are sorted priority desc, then difficulty desc, with original order as a stable tie-break
   — harder, higher-priority material sorts first.
3. Each day gets a target-minutes capacity, front-loaded: the first ~60% of days get 20% more capacity
   than the rest, so heavier material has somewhere to land early rather than being pushed to the last
   day before the interview. A single-day schedule gets one large capacity bucket instead.
4. Must-priority questions are placed first and are **never dropped** even if they exceed a day's
   capacity — they only spill onto a later day, guaranteeing "every must-have requirement appears
   somewhere in the schedule" holds even for a 1-day schedule with a lot of must-have material.
   Nice/general questions fill remaining room the same way and may legitimately go unscheduled if
   there's truly no room (they're not required to appear).
5. The result always has exactly `days` entries with integer `minutes` (no floats, ever) and each
   `question_ids` entry only ever references a question id that exists in the input list — the
   scheduler is the only thing that builds a schedule, so this invariant can't drift.

This is deliberately not delegated to the model (Section 8: "this is arithmetic and allocation. It
belongs in your code, not in a prompt") — both `runPipeline.ts` (first pass) and `regenerate.ts`
(after any edit that changes the question set) call the exact same function.

## Edge cases & failure handling (Section 10)

| Case | Handling |
|---|---|
| Invalid/404/timeout company URL | `assertPublicHttpUrl` rejects malformed URLs and non-http(s) schemes up front; a real fetch failure (404, timeout, DNS failure) is caught, the whole case is a hard failure only when the *homepage itself* can't be fetched at all — the crawl can't proceed without at least one page (`COMPANY_UNREACHABLE`) |
| No discoverable hiring/about page | The link-ranking crawl simply returns fewer pages; the kit is generated from whatever was found, `source.pages_used` honestly reflects what little (or nothing beyond the homepage) was available |
| Thin, two-line JD | `extractRequirements` returns few or zero requirements rather than inventing any — a downstream kit with few requirements, few questions, and a short schedule is the correct, honest output, not a failure |
| Public discussion turns up nothing | `discussionSearch` returns `[]`; the pipeline proceeds without fabricating a hiring process |
| Model returns invalid JSON / an incomplete kit | Every LLM call is parsed defensively with retry (`llm/client.ts`); the final candidate kit is always run through `assertValidKit` (Zod) before being saved — a kit that fails structure validation is a `KIT_VALIDATION_FAILED` error, never silently persisted half-formed |
| LLM provider rate-limits or briefly fails | `llm/rateLimiter.ts` retries 429/5xx with exponential backoff + jitter before giving up |
| Same description + company submitted twice | `dedupeHash(jd, companyUrl)` is unique per user (`Kit` model's compound index); re-submitting returns the existing kit id with `duplicate: true` instead of creating a second one |
| 1-day or 60-day schedule request | The scheduler's day-count is driven entirely by the requested `days` with no hardcoded range assumption; a 1-day schedule uses a single large capacity bucket, a 60-day one just produces 60 (mostly light) days — both were exercised directly in the scheduler's test suite |

## Security (Section 11)

- `backend/src/security/urlGuard.ts`: rejects malformed URLs and non-http(s) schemes always; in
  production (`NODE_ENV=production`), also resolves the hostname's DNS and rejects private/loopback/
  link-local ranges (RFC1918, `127.0.0.0/8`, `169.254.0.0/16` including the cloud metadata address,
  IPv6 equivalents) — the batch CLI's own fixture cases explicitly use `http://localhost:...`, so this
  check is env-gated rather than a blanket block that would break the mandatory Appendix B fixture
  format.
- `fetchLimited.ts` enforces a response size cap and only follows the crawl for `http`/`https`
  same-site links (`isSameSite`) — it never wanders off-domain.
- Fetched page text and the pasted JD are both treated as inert content passed into a prompt, never
  as instructions — `backend/src/llm/prompts/untrusted.ts` wraps every untrusted block with explicit
  delimiters and an instruction to treat its contents as data only, specifically because both of
  these inputs are text the developer didn't write and an attacker (a company embedding a prompt
  injection on their own careers page, say) could otherwise target.

## Known limitations

- The generation job queue is a simple in-process array (`jobQueue.ts`) — a backend process restart
  mid-generation leaves that one kit stuck at whatever status it last reached, rather than resuming.
  Acceptable for this assessment's scope; a production version would use a durable queue (e.g.
  BullMQ + Redis).
- Public "interview discussion" search depends on scraping DuckDuckGo's HTML results page (there's no
  free, key-less structured search API) — this is inherently more fragile than an official API and
  could break if DuckDuckGo changes its markup; it degrades to an honest empty result rather than
  crashing the pipeline, per Section 10.
- The optional "creative feature" (Section 14) was intentionally not built for this submission, to
  keep the core requirements' quality and testing as the priority within the time box.
- Company-brief regeneration only re-fetches its already-known source pages, not a fresh crawl — a
  deliberate trade-off documented above, not an oversight.

## Deployment

Deployed as three free-tier services: **Vercel** (frontend), **Render** (backend), **MongoDB Atlas**
(database). Full click-by-click steps — including exactly what to upload/connect where — are in
[`README.hinglish.md`](README.hinglish.md#deployment-step-by-step). In short:

1. **MongoDB Atlas**: create a free (M0) cluster, add a database user, allow access from anywhere
   (`0.0.0.0/0`, since Render's egress IPs aren't fixed on the free plan), copy the connection string
   into `MONGODB_URI`.
2. **Render** (backend): new Web Service from this repo (`render.yaml` at the repo root configures
   build/start commands for you — Render detects it automatically as a Blueprint). Set
   `MONGODB_URI`, `GEMINI_API_KEY`, and `FRONTEND_ORIGIN` (the Vercel URL from step 3) in the
   dashboard; `JWT_SECRET` is auto-generated by the blueprint.
3. **Vercel** (frontend): import this repo, set the project's Root Directory to `frontend`, set
   `NEXT_PUBLIC_API_URL` to the Render backend's public URL, deploy.
4. Go back to Render and confirm `FRONTEND_ORIGIN` exactly matches the final Vercel URL (no trailing
   slash) — CORS + the session cookie both depend on this matching exactly.
