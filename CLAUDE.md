# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GameDNA — a privacy-first Steam game discovery app with Tinder-style swipe interface, taste profiling, and AI-powered recommendations (WebLLM in-browser or local Ollama). Fully client-side local-first architecture using sql.js (WASM) for storage. Optionally wrapped as a desktop app via Tauri v2.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Start Vite dev server (port 5173, includes Steam API proxy)
bun run build            # Build client for production
bun run tauri:dev        # Start Tauri desktop dev
bun run tauri:build      # Build Tauri desktop app
```

Requires a Steam API key (entered during onboarding, stored locally). Optionally Ollama running locally for AI scoring.

## Architecture

Local-first SPA with an optional micro-proxy for development:

- **`client/`** — Vite + React 19 + Tailwind CSS v4 SPA. Entry: `client/src/main.tsx`
- **`server/`** — Standalone micro-proxy (`server/proxy.ts`, ~100 lines). Only forwards Steam API requests to bypass CORS in browser dev mode. Not used in Tauri production builds.
- **`shared/`** — Shared TypeScript types (`shared/types.ts`)

### Client Structure

- **`client/src/db/`** — SQLite via sql.js (WASM). Schema in `schema.ts` (raw SQL DDL), connection/persistence in `index.ts`, query helpers in `queries.ts`, API key encryption in `crypto.ts`.
- **`client/src/services/`** — All business logic runs client-side: `steam-api.ts` (Steam Web API client with rate limiting), `game-cache.ts` (local game metadata cache), `taste-profile.ts` (statistical taste scoring), `recommendation.ts` (3-layer recommendation pipeline), `pool-expansion.ts` (taste-driven discovery expansion), `sync-manager.ts` (library/wishlist sync orchestration), `ai-engine.ts` (pluggable AI abstraction), `ollama-engine.ts`, `webllm-engine.ts`, `ai-features.ts`, `tag-filter.ts`, `cauldron.ts`, `config.ts`.
- **`client/src/hooks/`** — React hooks: `use-auth.ts`, `use-discovery.ts`, `use-profile.ts`, `use-ai.ts`, `use-bookmarks.ts`, `use-keyboard-shortcuts.ts`, `use-local-auth.ts`, `use-theme.ts`.
- **`client/src/pages/`** — Landing, Discovery (swipe UI), Profile (radar chart), Recommendations, Backlog, GameDetail, Chat, Cauldron, Filters, History, Settings, Onboarding, Stats, MyLists, Help pages.
- **`client/src/components/`** — GameCard, SwipeControls, FilterPanel, RadarChart (recharts), WhyThisGame, MatchExplainer, GameGrid, Navbar, Toast, ErrorBoundary, DataManagement, WebLLMSetup, MediaGallery, BookmarkButton, Logo, Select, MigrationTool.
- **`client/src/contexts/`** — `db-context.tsx` (React context for DB access).
- **`client/src/i18n/`** — Internationalization via i18next (currently English).
- **`client/src/lib/api.ts`** — Fetch wrapper for API calls.

### Key Patterns

- **Storage:** sql.js (WASM) SQLite stored in OPFS (browser) or AppData (Tauri via `@tauri-apps/plugin-fs`). Debounced persistence after every write.
- **Dev proxy:** In dev, Vite's built-in proxy OR standalone `server/proxy.ts` forwards `/api/steam/*` to Steam APIs. In Tauri production, the client calls Steam directly (no proxy).
- **Auth:** No server auth — user enters Steam ID + API key during onboarding, stored locally with AES-GCM obfuscation (see crypto.ts).
- **Recommendation pipeline:** Layer 1 (statistical taste profile from library + swipes + bookmarks) → Layer 2 (SQL candidate filter + heuristic scoring, top 50) → Layer 3 (AI re-ranking via WebLLM or Ollama, optional).
- **AI providers:** WebLLM (in-browser, default) or Ollama (local server). Configured during onboarding. AI is optional — falls back to heuristic scoring.
- **Path alias:** `@shared/*` maps to `./shared/*` in tsconfig.
- **i18n:** Uses i18next; translation keys in `client/src/i18n/en.ts`.

### Database

SQLite schema defined as raw SQL in `client/src/db/schema.ts`. Key tables: `users`, `games`, `user_games`, `swipe_history`, `taste_profiles`, `recommendations`, `bookmarks`, `profile_snapshots`, `collections`, `collection_games`, `game_notes`, `game_status`, `user_settings`, `local_config`. Incremental migrations via ALTER TABLE in `MIGRATIONS_SQL` array.
