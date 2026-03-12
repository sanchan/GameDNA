import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { auto_categories, games, user_games, taste_profiles } from '../db/schema';
import { generateJSON, checkOllamaHealth, generateText } from '../services/ollama';

const aiFeaturesRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// POST /api/ai/categorize — auto-categorize user's games
aiFeaturesRoutes.post('/categorize', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const healthy = await checkOllamaHealth();
  if (!healthy) return c.json({ error: 'AI not available' }, 503);

  // Get user's top games
  const userGames = db
    .select({ game_id: user_games.game_id, playtime_mins: user_games.playtime_mins, name: games.name, genres: games.genres, tags: games.tags })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(and(eq(user_games.user_id, session.userId), eq(user_games.from_wishlist, 0)))
    .orderBy(desc(user_games.playtime_mins))
    .limit(50)
    .all();

  if (userGames.length === 0) return c.json({ categorized: 0 });

  const gamesList = userGames.map((g) => {
    const genres = g.genres ? JSON.parse(g.genres) : [];
    return `${g.name} (${Math.round((g.playtime_mins ?? 0) / 60)}h, genres: ${genres.join(', ')})`;
  }).join('\n');

  const prompt = `Categorize these games into one of these categories: "Long RPG", "Short Indie", "Multiplayer Casual", "Competitive", "Story-driven", "Sandbox/Exploration", "Roguelike/Roguelite", "Strategy/Tactics", "Horror/Thriller", "Cozy/Relaxing", "Action/Combat", "Puzzle/Brain".

Games:
${gamesList}

Return JSON array: [{"name": "Game Name", "category": "Category", "confidence": 0.0-1.0}]
Only return the JSON array.`;

  const result = await generateJSON<{ name: string; category: string; confidence: number }[]>(prompt, 0.3);
  if (!result || !Array.isArray(result)) return c.json({ categorized: 0 });

  const now = Math.floor(Date.now() / 1000);
  let categorized = 0;

  for (const item of result) {
    const game = userGames.find((g) => g.name?.toLowerCase() === item.name?.toLowerCase());
    if (!game) continue;

    db.insert(auto_categories)
      .values({
        user_id: session.userId,
        game_id: game.game_id!,
        category: item.category,
        confidence: item.confidence,
        categorized_at: now,
      })
      .onConflictDoUpdate({
        target: [auto_categories.user_id, auto_categories.game_id],
        set: { category: item.category, confidence: item.confidence, categorized_at: now },
      })
      .run();
    categorized++;
  }

  return c.json({ categorized });
});

// GET /api/ai/categories — get categorized games
aiFeaturesRoutes.get('/categories', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const rows = db
    .select({
      game_id: auto_categories.game_id,
      category: auto_categories.category,
      confidence: auto_categories.confidence,
      name: games.name,
      header_image: games.header_image,
    })
    .from(auto_categories)
    .innerJoin(games, eq(auto_categories.game_id, games.id))
    .where(eq(auto_categories.user_id, session.userId))
    .orderBy(auto_categories.category, desc(auto_categories.confidence))
    .all();

  // Group by category
  const grouped: Record<string, { gameId: number; name: string; headerImage: string | null; confidence: number }[]> = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({
      gameId: row.game_id,
      name: row.name,
      headerImage: row.header_image,
      confidence: row.confidence ?? 0,
    });
  }

  return c.json(grouped);
});

// POST /api/ai/mood-recommendations — mood-based recommendations
aiFeaturesRoutes.post('/mood-recommendations', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { mood } = await c.req.json<{ mood: string }>();
  const validMoods = ['relaxed', 'competitive', 'narrative', 'exploration', 'social', 'challenging'];

  if (!validMoods.includes(mood)) return c.json({ error: 'Invalid mood' }, 400);

  const healthy = await checkOllamaHealth();

  // Get taste profile
  const profile = db.select().from(taste_profiles).where(eq(taste_profiles.user_id, session.userId)).get();
  const genreScores: Record<string, number> = profile?.genre_scores ? JSON.parse(profile.genre_scores) : {};
  const topGenres = Object.entries(genreScores).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name);

  // Map moods to genre/tag preferences
  const moodGenreMap: Record<string, string[]> = {
    relaxed: ['Casual', 'Simulation', 'Indie'],
    competitive: ['Action', 'Sports', 'Racing', 'Strategy'],
    narrative: ['Adventure', 'RPG', 'Indie'],
    exploration: ['Adventure', 'RPG', 'Simulation', 'Indie'],
    social: ['Free to Play', 'Action', 'Casual'],
    challenging: ['Action', 'RPG', 'Strategy'],
  };

  const moodGenres = moodGenreMap[mood] ?? [];

  // Find games matching mood genres + user preferences
  const allCandidates = db
    .select()
    .from(games)
    .where(sql`${games.review_score} >= 70`)
    .orderBy(desc(games.review_count))
    .limit(200)
    .all();

  const scored = allCandidates.map((game) => {
    const gameGenres: string[] = game.genres ? JSON.parse(game.genres) : [];
    const moodMatch = gameGenres.filter((g) => moodGenres.some((mg) => g.toLowerCase().includes(mg.toLowerCase()))).length;
    const profileMatch = gameGenres.filter((g) => topGenres.some((tg) => g.toLowerCase().includes(tg.toLowerCase()))).length;
    const reviewNorm = (game.review_score ?? 50) / 100;

    return { game, score: moodMatch * 0.5 + profileMatch * 0.3 + reviewNorm * 0.2 };
  });

  scored.sort((a, b) => b.score - a.score);

  const results = scored.slice(0, 10).map((s) => ({
    game: {
      id: s.game.id,
      name: s.game.name,
      headerImage: s.game.header_image,
      genres: s.game.genres ? JSON.parse(s.game.genres) : [],
      reviewScore: s.game.review_score,
      priceCents: s.game.price_cents,
      priceCurrency: s.game.price_currency,
    },
    score: Math.round(s.score * 100),
    mood,
  }));

  return c.json(results);
});

// POST /api/ai/summarize-reviews/:appid — AI summarize Steam reviews
aiFeaturesRoutes.post('/summarize-reviews/:appid', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const appid = Number(c.req.param('appid'));
  const healthy = await checkOllamaHealth();
  if (!healthy) return c.json({ error: 'AI not available' }, 503);

  // Fetch recent reviews from Steam
  try {
    const res = await fetch(`https://store.steampowered.com/appreviews/${appid}?json=1&filter=recent&language=english&num_per_page=20&purchase_type=all`);
    if (!res.ok) return c.json({ error: 'Failed to fetch reviews' }, 500);

    const data = await res.json() as { reviews?: Array<{ review: string; voted_up: boolean }> };
    const reviews = data.reviews ?? [];

    if (reviews.length === 0) return c.json({ summary: 'No reviews available.' });

    const positiveReviews = reviews.filter((r) => r.voted_up).slice(0, 5).map((r) => r.review.slice(0, 200));
    const negativeReviews = reviews.filter((r) => !r.voted_up).slice(0, 5).map((r) => r.review.slice(0, 200));

    // Get user taste profile for personalized summary
    const profile = db.select().from(taste_profiles).where(eq(taste_profiles.user_id, session.userId)).get();
    const topGenres = profile?.genre_scores
      ? Object.entries(JSON.parse(profile.genre_scores) as Record<string, number>).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name)
      : [];

    const prompt = `Summarize these Steam reviews in 2-3 sentences, highlighting pros and cons. Focus on aspects relevant to someone who enjoys: ${topGenres.join(', ') || 'various genres'}.

POSITIVE REVIEWS:
${positiveReviews.join('\n---\n')}

NEGATIVE REVIEWS:
${negativeReviews.join('\n---\n')}

Be concise and balanced.`;

    const summary = await generateText(prompt, 0.5);
    return c.json({ summary: summary || 'Could not generate summary.' });
  } catch {
    return c.json({ error: 'Failed to summarize reviews' }, 500);
  }
});

export default aiFeaturesRoutes;
