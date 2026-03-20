# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GameDNA (steam-search) — a Steam game discovery web app with Tinder-style swipe interface, taste profiling, and AI-powered recommendations via local Ollama (Llama 3.1 8B). Written in Spanish planning docs but English code.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Start Vite dev server (port 5173, includes Steam API proxy)
bun run build            # Build client for production
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Push schema to DB (drizzle-kit push)
```

Requires `STEAM_API_KEY` and optionally Ollama running locally. See `.env.example` for all env vars.

## Architecture

Single-package monorepo with three directories:

- **`server/`** — Hono HTTP server running on Bun. Entry: `server/index.ts`
- **`client/`** — Vite + React 19 + Tailwind CSS v4 SPA. Entry: `client/src/main.tsx`
- **`shared/`** — Shared TypeScript types (`shared/types.ts`)

### Server Structure

- `server/db/` — SQLite via Drizzle ORM + `bun:sqlite`. Tables auto-created on startup (no migration runner needed in dev). Schema in `schema.ts`, connection in `index.ts`.
- `server/routes/` — Hono route modules: auth, user, games, discovery, backlog, recommendations. All mounted under `/api/`.
- `server/services/` — Business logic: `steam-api.ts` (Steam Web API client with rate limiting), `game-cache.ts` (SQLite game metadata cache), `taste-profile.ts` (statistical taste scoring), `recommendation.ts` (3-layer recommendation pipeline), `ollama.ts` (Ollama client with graceful degradation).
- `server/middleware/auth.ts` — Session validation middleware.
- `server/lib/` — `steam-openid.ts` (OpenID 2.0 flow), `session.ts` (cookie-based sessions).

### Client Structure

- `client/src/lib/api.ts` — Fetch wrapper for API calls.
- `client/src/hooks/` — `use-auth.ts`, `use-discovery.ts`, `use-profile.ts` (TanStack Query hooks).
- `client/src/pages/` — Landing, Discovery (swipe UI), Profile (radar chart), Recommendations, Backlog, GameDetail.
- `client/src/components/` — GameCard, SwipeControls, FilterPanel, RadarChart (recharts), WhyThisGame, GameGrid, Navbar, Toast, ErrorBoundary.

### Key Patterns

- In dev: Vite (5173) proxies `/api/*` to Hono (3000). In prod: Hono serves `client/dist/` static files.
- DB is SQLite at `./data/gamedna.db` with WAL mode and foreign keys enabled.
- Auth uses Steam OpenID 2.0 with HTTP-only cookie sessions.
- Recommendation pipeline: Layer 1 (statistical taste profile) → Layer 2 (SQL pre-filter, top 50) → Layer 3 (Ollama AI scoring, batches of 10). Falls back to Layer 2 only if Ollama is unavailable.
- Path alias: `@shared/*` maps to `./shared/*` in tsconfig.
