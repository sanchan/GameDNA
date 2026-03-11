import { eq, and, notInArray, desc } from 'drizzle-orm';
import { db } from '../db';
import { games, user_games, swipe_history, taste_profiles, recommendations } from '../db/schema';
import { checkOllamaHealth, generateJSON } from './ollama';
import type { TasteProfile } from '../../shared/types';

interface AIScoredGame {
  appid: number;
  score: number;
  explanation: string;
}

function parseTasteProfile(row: typeof taste_profiles.$inferSelect): TasteProfile {
  return {
    genreScores: row.genre_scores ? JSON.parse(row.genre_scores) : {},
    tagScores: row.tag_scores ? JSON.parse(row.tag_scores) : {},
    pricePref: row.price_pref ? JSON.parse(row.price_pref) : { min: 0, max: 6000, avg: 1500 },
    playtimePref: row.playtime_pref ? JSON.parse(row.playtime_pref) : { avgHours: 20, preferLong: false },
    aiSummary: row.ai_summary,
  };
}

function heuristicScore(
  game: typeof games.$inferSelect,
  topGenres: Set<string>,
  topTags: Set<string>,
): number {
  const gameGenres: string[] = game.genres ? JSON.parse(game.genres) : [];
  const gameTags: string[] = game.tags ? JSON.parse(game.tags) : [];

  const genreMatch = gameGenres.filter((g) => topGenres.has(g.toLowerCase())).length / Math.max(topGenres.size, 1);
  const tagMatch = gameTags.filter((t) => topTags.has(t.toLowerCase())).length / Math.max(topTags.size, 1);
  const reviewNorm = (game.review_score ?? 50) / 100;

  // Recency: games released in last 2 years get a boost
  let recency = 0.5;
  if (game.release_date) {
    const releaseYear = parseInt(game.release_date.slice(0, 4));
    const currentYear = new Date().getFullYear();
    if (!isNaN(releaseYear)) {
      const age = currentYear - releaseYear;
      recency = Math.max(0, 1 - age / 10);
    }
  }

  return 0.4 * genreMatch + 0.3 * tagMatch + 0.2 * reviewNorm + 0.1 * recency;
}

export async function generateRecommendations(userId: number): Promise<number> {
  // Layer 1: Get taste profile
  const profile = db.select().from(taste_profiles).where(eq(taste_profiles.user_id, userId)).get();
  if (!profile) return 0;

  const taste = parseTasteProfile(profile);

  const topGenres = new Set(
    Object.entries(taste.genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name]) => name.toLowerCase()),
  );

  const topTags = new Set(
    Object.entries(taste.tagScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([name]) => name.toLowerCase()),
  );

  // Layer 2: SQL pre-filter
  // Get IDs to exclude: owned games, swiped 'no', existing undismissed recommendations
  const ownedRows = db
    .select({ gameId: user_games.game_id })
    .from(user_games)
    .where(eq(user_games.user_id, userId))
    .all();

  const swipedNoRows = db
    .select({ gameId: swipe_history.game_id })
    .from(swipe_history)
    .where(and(eq(swipe_history.user_id, userId), eq(swipe_history.decision, 'no')))
    .all();

  const existingRecRows = db
    .select({ gameId: recommendations.game_id })
    .from(recommendations)
    .where(and(eq(recommendations.user_id, userId), eq(recommendations.dismissed, 0)))
    .all();

  const excludeIds = [
    ...new Set([
      ...ownedRows.map((r) => r.gameId!),
      ...swipedNoRows.map((r) => r.gameId),
      ...existingRecRows.map((r) => r.gameId),
    ]),
  ];

  const whereClause = excludeIds.length > 0 ? notInArray(games.id, excludeIds) : undefined;

  const candidates = db
    .select()
    .from(games)
    .where(whereClause)
    .orderBy(desc(games.review_count))
    .limit(200)
    .all();

  // Score and take top 50
  const scored = candidates
    .map((game) => ({
      game,
      hScore: heuristicScore(game, topGenres, topTags),
    }))
    .sort((a, b) => b.hScore - a.hScore)
    .slice(0, 50);

  if (scored.length === 0) return 0;

  // Layer 3: AI Scoring with Ollama
  const ollamaAvailable = await checkOllamaHealth();
  const nowUnix = Math.floor(Date.now() / 1000);
  let finalResults: { appid: number; score: number; explanation: string }[];

  if (ollamaAvailable) {
    const topGenresList = Object.entries(taste.genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name);

    const topTagsList = Object.entries(taste.tagScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name]) => name);

    const profileSummary = `Favorite genres: ${topGenresList.join(', ')}. Favorite tags: ${topTagsList.join(', ')}. Price range: $${(taste.pricePref.min / 100).toFixed(0)}-$${(taste.pricePref.max / 100).toFixed(0)}.`;

    finalResults = [];

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < scored.length; i += batchSize) {
      const batch = scored.slice(i, i + batchSize);
      const gameList = batch
        .map((s) => {
          const g = s.game;
          const genres: string[] = g.genres ? JSON.parse(g.genres) : [];
          const tags: string[] = g.tags ? JSON.parse(g.tags) : [];
          return `- appid: ${g.id}, name: "${g.name}", genres: [${genres.join(', ')}], tags: [${tags.slice(0, 5).join(', ')}], review_score: ${g.review_score ?? 'N/A'}, price: $${((g.price_cents ?? 0) / 100).toFixed(2)}`;
        })
        .join('\n');

      const prompt = `You are a game recommendation engine. Given a user's taste profile and a list of games, score each game from 0 to 1 based on how well it matches the user's preferences. Provide a brief 1-2 sentence explanation for each.

User taste profile: ${profileSummary}

Games to score:
${gameList}

Respond with a JSON object containing a "games" array. Each element should have "appid" (number), "score" (number 0-1), and "explanation" (string, 1-2 sentences).
Example: {"games": [{"appid": 123, "score": 0.85, "explanation": "Matches your love for RPGs with deep story."}]}`;

      const result = await generateJSON<{ games: AIScoredGame[] }>(prompt);
      if (result?.games) {
        finalResults.push(...result.games);
      } else {
        // Fall back to heuristic scores for this batch
        for (const s of batch) {
          finalResults.push({
            appid: s.game.id,
            score: s.hScore,
            explanation: '',
          });
        }
      }
    }
  } else {
    // Ollama unavailable - use heuristic scores only
    finalResults = scored.map((s) => ({
      appid: s.game.id,
      score: s.hScore,
      explanation: '',
    }));
  }

  // Upsert results into recommendations table
  let count = 0;
  for (const result of finalResults) {
    db.insert(recommendations)
      .values({
        user_id: userId,
        game_id: result.appid,
        score: result.score,
        ai_explanation: result.explanation || null,
        generated_at: nowUnix,
        dismissed: 0,
      })
      .onConflictDoUpdate({
        target: [recommendations.user_id, recommendations.game_id],
        set: {
          score: result.score,
          ai_explanation: result.explanation || null,
          generated_at: nowUnix,
          dismissed: 0,
        },
      })
      .run();
    count++;
  }

  return count;
}

export async function explainRecommendation(userId: number, gameId: number): Promise<AsyncGenerator<string> | string> {
  const profile = db.select().from(taste_profiles).where(eq(taste_profiles.user_id, userId)).get();
  const game = db.select().from(games).where(eq(games.id, gameId)).get();

  if (!profile || !game) return 'Unable to generate explanation - missing data.';

  const taste = parseTasteProfile(profile);

  const topGenresList = Object.entries(taste.genreScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  const topTagsList = Object.entries(taste.tagScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name]) => name);

  const gameGenres: string[] = game.genres ? JSON.parse(game.genres) : [];
  const gameTags: string[] = game.tags ? JSON.parse(game.tags) : [];

  const prompt = `You are a helpful gaming advisor. Explain why "${game.name}" is a good match for this player in 2-3 paragraphs. Be specific about what aspects of the game align with their preferences. Keep it conversational and enthusiastic.

Player's favorite genres: ${topGenresList.join(', ')}
Player's favorite tags: ${topTagsList.join(', ')}
Player's price range: $${(taste.pricePref.min / 100).toFixed(0)}-$${(taste.pricePref.max / 100).toFixed(0)}
Player's avg playtime: ${taste.playtimePref.avgHours} hours

Game: ${game.name}
Genres: ${gameGenres.join(', ')}
Tags: ${gameTags.join(', ')}
Description: ${game.short_desc || 'No description available'}
Review score: ${game.review_score ?? 'N/A'}%
Price: $${((game.price_cents ?? 0) / 100).toFixed(2)}`;

  const { generateStream, checkOllamaHealth } = await import('./ollama');
  const healthy = await checkOllamaHealth();

  if (!healthy) {
    return `"${game.name}" looks like a great match for you! It features ${gameGenres.slice(0, 3).join(', ')} gameplay with elements like ${gameTags.slice(0, 4).join(', ')} that align well with your gaming preferences.`;
  }

  return generateStream(prompt, 0.7);
}
