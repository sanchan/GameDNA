// AI features — ported from server/routes/ai-features.ts + recommendation layer 3 + chat logic.
// Uses the pluggable AiEngine interface (Ollama or WebLLM).

import { getDb } from '../db/index';
import * as queries from '../db/queries';
import { getAiEngine } from './ai-engine';
import { getIgnoredTagsSet } from './tag-filter';
import { config } from './config';

function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string' || !val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  const results: T[] = [];
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as any[]);
  while (stmt.step()) results.push(stmt.getAsObject() as T);
  stmt.free();
  return results;
}

// ── Auto-categorize games ───────────────────────────────────────────────────

const CATEGORIES = [
  'Long RPG', 'Short Indie', 'Multiplayer Casual', 'Competitive',
  'Story-driven', 'Sandbox/Exploration', 'Roguelike/Roguelite',
  'Strategy/Tactics', 'Horror/Thriller', 'Cozy/Relaxing',
  'Action/Combat', 'Puzzle/Brain',
] as const;

export async function autoCategorizeGames(userId: number): Promise<number> {
  const engine = getAiEngine();
  if (!engine) return 0;

  const healthy = await engine.checkHealth();
  if (!healthy) return 0;

  const userGames = queryAll<{
    game_id: number; playtime_mins: number | null; name: string;
    genres: string | null; tags: string | null;
  }>(
    `SELECT ug.game_id, ug.playtime_mins, g.name, g.genres, g.tags
     FROM user_games ug
     INNER JOIN games g ON ug.game_id = g.id
     WHERE ug.user_id = ? AND ug.from_wishlist = 0
     ORDER BY ug.playtime_mins DESC
     LIMIT 50`,
    [userId],
  );

  if (userGames.length === 0) return 0;

  const gamesList = userGames.map((g) => {
    const genres = parseJson<string[]>(g.genres, []);
    return `${g.name} (${Math.round((g.playtime_mins ?? 0) / 60)}h, genres: ${genres.join(', ')})`;
  }).join('\n');

  const prompt = `Categorize these games into one of these categories: ${CATEGORIES.map((c) => `"${c}"`).join(', ')}.

Games:
${gamesList}

Return JSON array: [{"name": "Game Name", "category": "Category", "confidence": 0.0-1.0}]
Only return the JSON array.`;

  const result = await engine.generateJSON<{ name: string; category: string; confidence: number }[]>(prompt, 0.3);
  if (!result || !Array.isArray(result)) return 0;

  let categorized = 0;
  for (const item of result) {
    const game = userGames.find((g) => g.name?.toLowerCase() === item.name?.toLowerCase());
    if (!game || !CATEGORIES.includes(item.category as typeof CATEGORIES[number])) continue;
    queries.upsertAutoCategory(userId, game.game_id, item.category, item.confidence);
    categorized++;
  }

  return categorized;
}

// ── Mood-based recommendations ──────────────────────────────────────────────

const MOOD_GENRE_MAP: Record<string, string[]> = {
  relaxed: ['Casual', 'Simulation', 'Indie'],
  competitive: ['Action', 'Sports', 'Racing', 'Strategy'],
  narrative: ['Adventure', 'RPG', 'Indie'],
  exploration: ['Adventure', 'RPG', 'Simulation', 'Indie'],
  social: ['Free to Play', 'Action', 'Casual'],
  challenging: ['Action', 'RPG', 'Strategy'],
};

export const VALID_MOODS = Object.keys(MOOD_GENRE_MAP);

export function getMoodRecommendations(
  userId: number,
  mood: string,
): { game: { id: number; name: string; headerImage: string | null; genres: string[]; reviewScore: number | null; priceCents: number | null; priceCurrency: string | null }; score: number; mood: string }[] {
  const moodGenres = MOOD_GENRE_MAP[mood];
  if (!moodGenres) return [];

  const profile = queries.getTasteProfile(userId);
  const genreScores: Record<string, number> = profile?.genreScores ?? {};
  const topGenres = Object.entries(genreScores).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name);

  const candidates = queryAll<Record<string, unknown>>(
    `SELECT * FROM games WHERE review_score >= 70 ORDER BY review_count DESC LIMIT 200`,
  );

  const scored = candidates.map((game) => {
    const gameGenres = parseJson<string[]>(game.genres, []);
    const moodMatch = gameGenres.filter((g) =>
      moodGenres.some((mg) => g.toLowerCase().includes(mg.toLowerCase())),
    ).length;
    const profileMatch = gameGenres.filter((g) =>
      topGenres.some((tg) => g.toLowerCase().includes(tg.toLowerCase())),
    ).length;
    const reviewNorm = ((game.review_score as number) ?? 50) / 100;

    return { game, score: moodMatch * 0.5 + profileMatch * 0.3 + reviewNorm * 0.2 };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map((s) => ({
    game: {
      id: s.game.id as number,
      name: s.game.name as string,
      headerImage: (s.game.header_image as string) ?? null,
      genres: parseJson<string[]>(s.game.genres, []),
      reviewScore: (s.game.review_score as number) ?? null,
      priceCents: (s.game.price_cents as number) ?? null,
      priceCurrency: (s.game.price_currency as string) ?? null,
    },
    score: Math.round(s.score * 100),
    mood,
  }));
}

// ── Review summarization ────────────────────────────────────────────────────

export async function summarizeReviews(userId: number, appid: number): Promise<string> {
  const engine = getAiEngine();
  if (!engine) return 'AI not available. Configure an AI provider in Settings.';

  const healthy = await engine.checkHealth();
  if (!healthy) return 'AI is offline.';

  try {
    const res = await fetch(`/api/steam/reviews/${appid}?json=1&filter=recent&language=english&num_per_page=20&purchase_type=all`);
    if (!res.ok) return 'Failed to fetch reviews.';

    const data = await res.json() as { reviews?: Array<{ review: string; voted_up: boolean }> };
    const reviews = data.reviews ?? [];
    if (reviews.length === 0) return 'No reviews available.';

    const positive = reviews.filter((r) => r.voted_up).slice(0, 5).map((r) => r.review.slice(0, 200));
    const negative = reviews.filter((r) => !r.voted_up).slice(0, 5).map((r) => r.review.slice(0, 200));

    const profile = queries.getTasteProfile(userId);
    const topGenres = profile?.genreScores
      ? Object.entries(profile.genreScores).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name)
      : [];

    const prompt = `Summarize these Steam reviews in 2-3 sentences, highlighting pros and cons. Focus on aspects relevant to someone who enjoys: ${topGenres.join(', ') || 'various genres'}.

POSITIVE REVIEWS:
${positive.join('\n---\n')}

NEGATIVE REVIEWS:
${negative.join('\n---\n')}

Be concise and balanced.`;

    return await engine.generateText(prompt, 0.5) ?? 'Could not generate summary.';
  } catch {
    return 'Failed to summarize reviews.';
  }
}

// ── Layer 3: AI scoring for recommendations ─────────────────────────────────

interface AIScoredGame {
  appid: number;
  score: number;
  explanation: string;
}

export async function aiScoreRecommendations(
  userId: number,
  candidates: { game: Record<string, unknown>; hScore: number }[],
): Promise<{ appid: number; score: number; explanation: string }[] | null> {
  const engine = getAiEngine();
  if (!engine) return null;

  const healthy = await engine.checkHealth();
  if (!healthy) return null;

  const profile = queries.getTasteProfile(userId);
  if (!profile) return null;

  const ignoredTags = queries.getIgnoredTags(userId);
  const ignoredSet = getIgnoredTagsSet(ignoredTags);

  const topGenresList = Object.entries(profile.genreScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  const topTagsList = Object.entries(profile.tagScores)
    .filter(([name]) => !ignoredSet.has(name.toLowerCase()))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name]) => name);

  const profileSummary = `Favorite genres: ${topGenresList.join(', ')}. Favorite tags: ${topTagsList.join(', ')}. Price range: $${(profile.pricePref.min / 100).toFixed(0)}-$${(profile.pricePref.max / 100).toFixed(0)}.`;

  const results: AIScoredGame[] = [];
  const batchSize = config.recAiBatchSize;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const gameList = batch
      .map((s) => {
        const g = s.game;
        const genres = parseJson<string[]>(g.genres, []);
        const tags = parseJson<string[]>(g.tags, []);
        return `- appid: ${g.id}, name: "${g.name}", genres: [${genres.join(', ')}], tags: [${tags.slice(0, 5).join(', ')}], review_score: ${g.review_score ?? 'N/A'}, price: $${((g.price_cents as number ?? 0) / 100).toFixed(2)}`;
      })
      .join('\n');

    const prompt = `You are a game recommendation engine. Given a user's taste profile and a list of games, score each game from 0 to 1 based on how well it matches the user's preferences. Provide a brief 1-2 sentence explanation for each.

User taste profile: ${profileSummary}

Games to score:
${gameList}

Respond with a JSON object containing a "games" array. Each element should have "appid" (number), "score" (number 0-1), and "explanation" (string, 1-2 sentences).
Example: {"games": [{"appid": 123, "score": 0.85, "explanation": "Matches your love for RPGs with deep story."}]}`;

    const result = await engine.generateJSON<{ games: AIScoredGame[] }>(prompt);
    if (result?.games) {
      results.push(...result.games);
    } else {
      // Fall back to heuristic for this batch
      for (const s of batch) {
        results.push({ appid: s.game.id as number, score: s.hScore, explanation: '' });
      }
    }
  }

  return results;
}

// ── Chat: build context and generate response ──────────────────────────────

export function buildChatContext(userId: number): {
  genresList: string;
  gamesList: string;
  aiSummary: string;
} {
  const profile = queries.getTasteProfile(userId);
  const genreScores: Record<string, number> = profile?.genreScores ?? {};
  const topGenres = Object.entries(genreScores).sort(([, a], [, b]) => b - a).slice(0, 10);

  const topGames = queryAll<{ name: string; playtime_mins: number | null }>(
    `SELECT g.name, ug.playtime_mins
     FROM user_games ug
     INNER JOIN games g ON ug.game_id = g.id
     WHERE ug.user_id = ?
     ORDER BY ug.playtime_mins DESC
     LIMIT 20`,
    [userId],
  );

  return {
    genresList: topGenres.map(([name, score]) => `${name}: ${score.toFixed(2)}`).join(', '),
    gamesList: topGames.map((g) => `${g.name} (${Math.round((g.playtime_mins ?? 0) / 60)}h)`).join(', '),
    aiSummary: profile?.aiSummary ?? '',
  };
}

export async function* generateChatResponse(
  userId: number,
  message: string,
): AsyncGenerator<string> {
  const engine = getAiEngine();
  if (!engine) {
    yield 'AI is not configured. Go to Settings to set up Ollama or WebLLM.';
    return;
  }

  const healthy = await engine.checkHealth();
  if (!healthy) {
    yield 'AI is offline. Make sure your AI provider is running.';
    return;
  }

  const ctx = buildChatContext(userId);

  // Recent chat history
  const history = queries.getChatHistory(userId, 10);
  const chatHistory = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `You are a gaming advisor AI for GameDNA, a Steam game discovery app. You have full context of the user's gaming profile and should give personalized advice.

USER'S GAMING PROFILE:
- Top genres: ${ctx.genresList}
- Most played games: ${ctx.gamesList}
${ctx.aiSummary ? `- AI Summary: ${ctx.aiSummary}` : ''}

RECENT CONVERSATION:
${chatHistory}

User: ${message.trim()}

Respond helpfully and concisely. If asked for game recommendations, suggest specific games with brief reasons why they'd enjoy them based on their profile. Keep responses under 200 words.`;

  for await (const chunk of engine.generateStream(prompt, 0.7)) {
    yield chunk;
  }
}

// ── Explain recommendation ──────────────────────────────────────────────────

export const DEFAULT_EXPLANATION_TEMPLATE = `Explain in 3-5 short bullet points why "{{game_name}}" is a good match for this player. Each bullet should be one direct sentence — no filler, no fluff. Focus on concrete connections between the player's tastes and the game's strengths.

Player profile:
- Genres: {{player_genres}}
- Tags: {{player_tags}}
- Budget: {{player_budget}}
- Avg playtime: {{player_playtime}}

Game: {{game_name}}
- Genres: {{game_genres}}
- Tags: {{game_tags}}
- Description: {{game_description}}
- Reviews: {{game_reviews}}
- Price: {{game_price}}

Use "•" for bullets. No intro or closing sentence — just the bullets.`;

function buildExplanationPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export async function* explainRecommendation(
  userId: number,
  gameId: number,
): AsyncGenerator<string> {
  const profile = queries.getTasteProfile(userId);
  const game = queryAll<Record<string, unknown>>(
    'SELECT * FROM games WHERE id = ?',
    [gameId],
  )[0];

  if (!profile || !game) {
    yield 'Unable to generate explanation — missing data.';
    return;
  }

  const ignoredTags = queries.getIgnoredTags(userId);
  const ignoredSet = getIgnoredTagsSet(ignoredTags);

  const topGenresList = Object.entries(profile.genreScores)
    .sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name);
  const topTagsList = Object.entries(profile.tagScores)
    .filter(([name]) => !ignoredSet.has(name.toLowerCase()))
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([name]) => name);

  const gameGenres = parseJson<string[]>(game.genres, []);
  const gameTags = parseJson<string[]>(game.tags, []);

  const engine = getAiEngine();
  if (!engine || !(await engine.checkHealth())) {
    const bullets = [
      gameGenres.length > 0 ? `• Matches your taste in ${gameGenres.slice(0, 3).join(', ')} games` : null,
      gameTags.length > 0 ? `• Features tags you enjoy: ${gameTags.slice(0, 4).join(', ')}` : null,
      game.review_score ? `• ${game.review_score}% positive reviews` : null,
    ].filter(Boolean).join('\n');
    yield bullets || `• "${game.name}" aligns with your gaming preferences.`;
    return;
  }

  const userSettings = queries.getUserSettings(userId);
  const template = userSettings.explanationTemplate || DEFAULT_EXPLANATION_TEMPLATE;

  const vars: Record<string, string> = {
    game_name: game.name as string,
    game_genres: gameGenres.join(', '),
    game_tags: gameTags.join(', '),
    game_description: (game.short_desc as string) || 'N/A',
    game_reviews: `${game.review_score ?? 'N/A'}%`,
    game_price: `$${((game.price_cents as number ?? 0) / 100).toFixed(2)}`,
    player_genres: topGenresList.join(', '),
    player_tags: topTagsList.join(', '),
    player_budget: `$${(profile.pricePref.min / 100).toFixed(0)}-$${(profile.pricePref.max / 100).toFixed(0)}`,
    player_playtime: `${profile.playtimePref.avgHours}h`,
  };

  const prompt = buildExplanationPrompt(template, vars);

  for await (const chunk of engine.generateStream(prompt, 0.7)) {
    yield chunk;
  }
}
