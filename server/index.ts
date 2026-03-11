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

// In production, serve static files
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './client/dist' }));
  app.get('*', serveStatic({ path: './client/dist/index.html' }));
}

const port = Number(process.env.PORT) || 3000;
console.log(`Server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

export { app };
export type AppType = typeof app;
