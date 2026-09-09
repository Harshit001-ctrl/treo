# AI Interview Prep Kit

Work in progress — this README is a placeholder during the build. The full submission
README (setup, architecture, decisions, trade-offs) and a plain-English project guide will
be written once the implementation is complete.

## Repo layout
- `frontend/` — Next.js + Tailwind UI
- `backend/` — Express + MongoDB API, the research/generation pipeline, and the batch
  `evaluate` CLI
- `packages/shared/` — the Zod schema + TypeScript types for the kit structure, shared by
  both frontend and backend

## Quick start (local dev)
```bash
npm install                 # once, from the repo root — installs all workspaces
cp backend/.env.example backend/.env       # then fill in MONGODB_URI / GEMINI_API_KEY
cp frontend/.env.example frontend/.env.local

npm run dev:backend         # http://localhost:4000
npm run dev:frontend        # http://localhost:3000
```
