import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, desc } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { chat_messages, taste_profiles, user_games, games } from '../db/schema';
import { generateStream, checkOllamaHealth } from '../services/ollama';

const chatRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// GET /api/chat/history
chatRoutes.get('/history', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const rows = db
    .select()
    .from(chat_messages)
    .where(eq(chat_messages.user_id, session.userId))
    .orderBy(desc(chat_messages.created_at))
    .limit(50)
    .all();

  return c.json(rows.reverse().map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  })));
});

// POST /api/chat/message — send a message and get AI response (streaming)
chatRoutes.post('/message', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { message } = await c.req.json<{ message: string }>();
  if (!message?.trim()) return c.json({ error: 'Message required' }, 400);

  const healthy = await checkOllamaHealth();
  if (!healthy) {
    return c.json({ error: 'AI is not available. Make sure Ollama is running.' }, 503);
  }

  // Save user message
  const now = Math.floor(Date.now() / 1000);
  db.insert(chat_messages)
    .values({ user_id: session.userId, role: 'user', content: message.trim(), created_at: now })
    .run();

  // Build context: taste profile + top games
  const profile = db.select().from(taste_profiles).where(eq(taste_profiles.user_id, session.userId)).get();
  const genreScores: Record<string, number> = profile?.genre_scores ? JSON.parse(profile.genre_scores) : {};
  const topGenres = Object.entries(genreScores).sort(([, a], [, b]) => b - a).slice(0, 10);

  // Get top played games
  const topGames = db
    .select({ name: games.name, playtime_mins: user_games.playtime_mins, genres: games.genres })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(eq(user_games.user_id, session.userId))
    .orderBy(desc(user_games.playtime_mins))
    .limit(20)
    .all();

  const gamesList = topGames.map((g) => `${g.name} (${Math.round((g.playtime_mins ?? 0) / 60)}h)`).join(', ');
  const genresList = topGenres.map(([name, score]) => `${name}: ${score.toFixed(2)}`).join(', ');
  const aiSummary = profile?.ai_summary || '';

  // Get recent chat for context
  const recentChat = db
    .select()
    .from(chat_messages)
    .where(eq(chat_messages.user_id, session.userId))
    .orderBy(desc(chat_messages.created_at))
    .limit(10)
    .all()
    .reverse();

  const chatHistory = recentChat
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `You are a gaming advisor AI for GameDNA, a Steam game discovery app. You have full context of the user's gaming profile and should give personalized advice.

USER'S GAMING PROFILE:
- Top genres: ${genresList}
- Most played games: ${gamesList}
${aiSummary ? `- AI Summary: ${aiSummary}` : ''}

RECENT CONVERSATION:
${chatHistory}

User: ${message.trim()}

Respond helpfully and concisely. If asked for game recommendations, suggest specific games with brief reasons why they'd enjoy them based on their profile. Keep responses under 200 words.`;

  // Stream response
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = '';
      try {
        for await (const chunk of generateStream(prompt, 0.7)) {
          fullResponse += chunk;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }

        // Save assistant message
        db.insert(chat_messages)
          .values({ user_id: session.userId, role: 'assistant', content: fullResponse, created_at: Math.floor(Date.now() / 1000) })
          .run();

        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// DELETE /api/chat/history — clear chat
chatRoutes.delete('/history', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  db.delete(chat_messages).where(eq(chat_messages.user_id, session.userId)).run();
  return c.json({ success: true });
});

export default chatRoutes;
