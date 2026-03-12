import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import gameRoutes from './routes/games';
import discoveryRoutes from './routes/discovery';
import backlogRoutes from './routes/backlog';
import recommendationRoutes from './routes/recommendations';
import historyRoutes from './routes/history';
import listsRoutes from './routes/lists';
import { recacheGamesWithoutCurrency } from './services/game-cache';
import { startSessionCleanup } from './lib/session';
import { cleanupSyncStates } from './services/sync-manager';
import { db } from './db';
import { users } from './db/schema';
import { desc } from 'drizzle-orm';

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Auth routes
app.route('/api/auth', authRoutes);

// User routes
app.route('/api/user', userRoutes);

// Game routes
app.route('/api/games', gameRoutes);

// Discovery routes
app.route('/api/discovery', discoveryRoutes);

// Backlog routes
app.route('/api/backlog', backlogRoutes);

// Recommendation routes
app.route('/api/recommendations', recommendationRoutes);

// History routes
app.route('/api/history', historyRoutes);

// Lists routes (library, bookmarks, wishlist)
app.route('/api/lists', listsRoutes);

// Serve design files statically
app.use('/designs/*', serveStatic({ root: './' }));

// In production, serve static files
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './client/dist' }));
  app.get('*', serveStatic({ path: './client/dist/index.html' }));
}

const port = Number(process.env.PORT) || 3000;
console.log(`Server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

// Start periodic cleanup of expired sessions
startSessionCleanup();

// Clean up stale sync states from memory
cleanupSyncStates();

// Background: re-cache games missing currency info with the most recent user's country code
setTimeout(async () => {
  try {
    const lastUser = db.select({ country_code: users.country_code }).from(users).orderBy(desc(users.last_login)).limit(1).get();
    const cc = lastUser?.country_code ?? undefined;
    if (cc) {
      await recacheGamesWithoutCurrency(cc);
    }
  } catch (e) {
    console.error('[startup] Failed to re-cache game prices:', e);
  }
}, 2000);

export { app };
export type AppType = typeof app;
