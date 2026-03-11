 GameDNA - Plan de Implementación

 Contexto

 GameDNA — app web de descubrimiento de juegos de Steam que aprende las preferencias del usuario a través de
 un sistema de swipe tipo Tinder (sí/no/quizás), su biblioteca de Steam, y AI local (Ollama). Similar a
 gg.deals/trendingnow.games pero personalizada con AI.

 Tech Stack

 - Runtime: Bun
 - Backend: Hono (servidor HTTP)
 - Frontend: Vite + React + shadcn/ui + Tailwind CSS v4
 - DB: SQLite via Drizzle ORM + better-sqlite3
 - AI: Ollama (Llama 3.1 8B)
 - Auth: Steam OpenID 2.0

 ---
 Estructura del Proyecto

 gamedna/
 ├── package.json
 ├── drizzle.config.ts
 ├── .env / .env.example
 ├── server/
 │   ├── index.ts                  # Hono app entry
 │   ├── db/
 │   │   ├── index.ts              # drizzle instance
 │   │   └── schema.ts             # tablas
 │   ├── routes/
 │   │   ├── auth.ts               # Steam OpenID login/callback/logout
 │   │   ├── user.ts               # perfil, taste profile
 │   │   ├── games.ts              # búsqueda, detalles
 │   │   ├── discovery.ts          # swipe queue, registrar swipe
 │   │   ├── recommendations.ts    # recomendaciones AI
 │   │   └── backlog.ts            # backlog analysis
 │   ├── services/
 │   │   ├── steam-api.ts          # cliente Steam API + rate limiter
 │   │   ├── ollama.ts             # cliente Ollama
 │   │   ├── taste-profile.ts      # cálculo de perfil de gustos
 │   │   ├── recommendation.ts     # pipeline de recomendaciones
 │   │   └── game-cache.ts         # caché de metadata de juegos
 │   ├── middleware/
 │   │   └── auth.ts               # validación de sesión
 │   └── lib/
 │       ├── steam-openid.ts       # OpenID 2.0
 │       └── session.ts            # sesiones con cookie
 ├── client/
 │   ├── index.html
 │   ├── vite.config.ts
 │   ├── src/
 │   │   ├── main.tsx
 │   │   ├── App.tsx               # React Router
 │   │   ├── lib/api.ts            # fetch wrapper
 │   │   ├── hooks/
 │   │   │   ├── use-auth.ts
 │   │   │   ├── use-discovery.ts
 │   │   │   └── use-profile.ts
 │   │   ├── pages/
 │   │   │   ├── Landing.tsx       # hero + Steam login
 │   │   │   ├── Discovery.tsx     # swipe interface
 │   │   │   ├── Profile.tsx       # Gaming DNA + stats
 │   │   │   ├── Recommendations.tsx
 │   │   │   ├── Backlog.tsx
 │   │   │   └── GameDetail.tsx
 │   │   └── components/
 │   │       ├── ui/               # shadcn
 │   │       ├── GameCard.tsx
 │   │       ├── SwipeControls.tsx
 │   │       ├── RadarChart.tsx
 │   │       ├── FilterPanel.tsx
 │   │       ├── WhyThisGame.tsx
 │   │       ├── Navbar.tsx
 │   │       └── GameGrid.tsx
 └── shared/
     └── types.ts

 Monorepo single-package. En dev: Vite (5173) proxy a Hono (3000). En prod: Hono sirve el build estático.

 ---
 Schema de Base de Datos

 users — id, steam_id (unique), display_name, avatar_url, profile_url, last_login, created_at

 games — id (= Steam appid), name, short_desc, header_image, genres (json), tags (json), release_date,
 price_cents, review_score (0-100), review_count, developers (json), publishers (json), platforms (json),
 detailed_desc, cached_at

 user_games — user_id, game_id, playtime_mins, last_played, from_wishlist, synced_at (PK: user_id + game_id)

 swipe_history — id, user_id, game_id, decision ('yes'|'no'|'maybe'), swiped_at (UNIQUE: user_id + game_id)

 taste_profiles — id, user_id (unique), genre_scores (json), tag_scores (json), price_pref (json),
 playtime_pref (json), ai_summary, updated_at

 recommendations — id, user_id, game_id, score (0-1), ai_explanation, generated_at, dismissed (UNIQUE: user_id
  + game_id)

 sessions — id (token), user_id, expires_at

 ---
 API Routes

 ┌───────────┬────────┬──────────────────────────────────┬─────────────────────────────────┐
 │   Grupo   │ Método │               Ruta               │           Descripción           │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Auth      │ GET    │ /api/auth/login                  │ Redirect a Steam OpenID         │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Auth      │ GET    │ /api/auth/callback               │ Callback de Steam, crear sesión │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Auth      │ POST   │ /api/auth/logout                 │ Cerrar sesión                   │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Auth      │ GET    │ /api/auth/me                     │ Usuario actual o 401            │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ User      │ GET    │ /api/user/profile                │ Perfil + taste profile          │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ User      │ POST   │ /api/user/sync                   │ Sync biblioteca Steam           │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ User      │ GET    │ /api/user/gaming-dna             │ Datos para radar chart          │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Games     │ GET    │ /api/games/search                │ Buscar/filtrar catálogo         │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Games     │ GET    │ /api/games/:appid                │ Detalles de un juego            │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Discovery │ GET    │ /api/discovery/queue             │ Batch de juegos para swipe      │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Discovery │ POST   │ /api/discovery/swipe             │ Registrar decisión              │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Recs      │ POST   │ /api/recommendations/generate    │ Generar recomendaciones AI      │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Recs      │ GET    │ /api/recommendations             │ Listar recomendaciones          │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Recs      │ GET    │ /api/recommendations/:id/explain │ "¿Por qué este juego?"          │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Backlog   │ GET    │ /api/backlog                     │ Juegos no jugados priorizados   │
 ├───────────┼────────┼──────────────────────────────────┼─────────────────────────────────┤
 │ Backlog   │ POST   │ /api/backlog/analyze             │ Analizar backlog con AI         │
 └───────────┴────────┴──────────────────────────────────┴─────────────────────────────────┘

 ---
 Sistema de Recomendaciones (3 capas)

 Capa 1: Perfil Estadístico (sin AI)

 Calcula scores 0-1 por género/tag basado en:
 - Juegos con >10h → peso 1.0, 1-10h → 0.5, <1h → 0.1
 - Swipe "yes" → 1.0, "maybe" → 0.3, "no" → -0.5
 - Se normaliza y almacena en taste_profiles
 - Se recalcula en cada swipe y sync

 Capa 2: Pre-filtro SQL

 Excluye juegos ya propios, ya swiped "no", ya recomendados. Aplica filtros del usuario (precio, reviews,
 géneros). Ordena por score heurístico: 0.4*genre_match + 0.3*tag_match + 0.2*review_score + 0.1*recency. Top
 50 candidatos.

 Capa 3: AI Scoring (Ollama)

 Envía el taste profile + 10 candidatos por llamada a Ollama. Pide JSON con score 0-1 y explicación por juego.
  5 llamadas para 50 candidatos. Resultados cacheados en tabla recommendations.

 Configuración Ollama:
 - format: 'json' para scoring, stream: true para explicaciones
 - Temperature 0.3 para scoring, 0.7 para explicaciones
 - Degradación graceful si Ollama no está disponible (solo Capa 2)

 ---
 Páginas Frontend

 ┌──────────────────┬─────────────────┬────────────────────────────────────────────────────────────────────┐
 │       Ruta       │     Página      │                            Descripción                             │
 ├──────────────────┼─────────────────┼────────────────────────────────────────────────────────────────────┤
 │ /                │ Landing         │ Hero + "Sign in with Steam"                                        │
 ├──────────────────┼─────────────────┼────────────────────────────────────────────────────────────────────┤
 │                  │                 │ Card stack Tinder-style: carta centrada con imagen header, nombre, │
 │ /discover        │ Discovery       │  tags, precio, reviews. Animación de deslizar al swipear. 3        │
 │                  │                 │ botones (No/Quizás/Sí) + teclado (←↓→). Panel de filtros           │
 │                  │                 │ colapsable.                                                        │
 ├──────────────────┼─────────────────┼────────────────────────────────────────────────────────────────────┤
 │ /profile         │ Profile         │ Avatar, stats, Gaming DNA (radar chart recharts), AI summary,      │
 │                  │                 │ historial swipes                                                   │
 ├──────────────────┼─────────────────┼────────────────────────────────────────────────────────────────────┤
 │ /recommendations │ Recommendations │ Grid de GameCards con score + explicación AI                       │
 ├──────────────────┼─────────────────┼────────────────────────────────────────────────────────────────────┤
 │ /backlog         │ Backlog         │ Lista de juegos no jugados con prioridad AI                        │
 ├──────────────────┼─────────────────┼────────────────────────────────────────────────────────────────────┤
 │ /game/:appid     │ GameDetail      │ Detalle completo + "Why this game?" con streaming                  │
 └──────────────────┴─────────────────┴────────────────────────────────────────────────────────────────────┘

 State management: TanStack Query para server state. React context para auth.

 ---
 Fases de Implementación

 Fase 1: Scaffolding

 - bun init, instalar deps (hono, drizzle-orm, better-sqlite3, react, vite, shadcn, tailwindcss v4,
 @tanstack/react-query, recharts, react-router)
 - Configurar Hono server + Vite client con proxy
 - Schema Drizzle + migración inicial
 - Verificar: server arranca, client build OK, DB crea tablas

 Fase 2: Autenticación Steam

 - Steam OpenID 2.0 flow (redirect → Steam → callback → sesión)
 - Rutas auth, middleware, sesiones con cookie HTTP-only
 - Frontend: Landing page, useAuth hook, Navbar
 - Verificar: login con Steam funciona, sesión persiste

 Fase 3: Sync de Datos Steam

 - Cliente Steam API con rate limiter (token bucket, 200 req/5min)
 - Game cache service (fetch + cache en SQLite, refresh si >7 días)
 - Endpoint /api/user/sync (owned games + wishlist)
 - Verificar: biblioteca del usuario se sincroniza a DB

 Fase 4: Discovery / Swipe

 - Queue logic: juegos no swiped, ordenados por popularidad/reviews
 - API: queue + swipe endpoints
 - Frontend: GameCard, SwipeControls, animaciones, keyboard shortcuts
 - FilterPanel (precio, fecha, score, géneros, tags)
 - Verificar: swipe funciona, decisiones se guardan

 Fase 5: Taste Profile + Gaming DNA

 - Cálculo estadístico del taste profile
 - Recálculo automático en swipe/sync
 - Frontend: Profile page con RadarChart (recharts)
 - Verificar: radar chart se actualiza con swipes

 Fase 6: Integración AI

 - Cliente Ollama con health check y degradación graceful
 - Generación de AI summary del perfil
 - Pipeline de recomendaciones (3 capas)
 - Frontend: Recommendations page, WhyThisGame con streaming
 - Verificar: AI genera recomendaciones coherentes

 Fase 7: Backlog Manager

 - Filtrar user_games con playtime bajo
 - AI prioriza basándose en taste profile
 - Frontend: Backlog page con lista ordenada
 - Verificar: juegos no jugados listados con sugerencias AI

 Fase 8: Polish

 - Loading skeletons, error boundaries, empty states
 - Responsive design, dark/light mode
 - Animaciones de swipe (framer-motion o CSS)
 - Toast notifications

 ---
 Verificación End-to-End

 1. Arrancar Ollama con ollama run llama3.1:8b
 2. bun run dev — server + client arrancan sin errores
 3. Login con Steam → redirect correcto → sesión activa
 4. Sync biblioteca → juegos aparecen en DB
 5. Discovery → swipe 10+ juegos → taste profile se actualiza
 6. Profile → radar chart muestra preferencias correctas
 7. Recommendations → genera recomendaciones con explicaciones AI
 8. Backlog → muestra juegos no jugados priorizados