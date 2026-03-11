import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { getSession } from '../lib/session';

type AuthEnv = {
  Variables: {
    userId: number;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, 'session');
  if (token) {
    const session = getSession(token);
    if (session) {
      c.set('userId', session.userId);
    }
  }
  await next();
});

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, 'session');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = getSession(token);
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('userId', session.userId);
  await next();
});
