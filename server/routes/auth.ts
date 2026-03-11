import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { getAuthUrl, verifyCallback } from '../lib/steam-openid';
import { createSession, deleteSession, getSession } from '../lib/session';
import { db } from '../db';
import { users } from '../db/schema';

const STEAM_API_KEY = process.env.STEAM_API_KEY || '';

const auth = new Hono();

auth.get('/login', (c) => {
  const realm = process.env.STEAM_REALM || 'http://localhost:5173';
  const returnUrl = process.env.STEAM_RETURN_URL || `${realm}/api/auth/callback`;
  const url = getAuthUrl(returnUrl, realm);
  return c.redirect(url);
});

auth.get('/callback', async (c) => {
  const params: Record<string, string> = {};
  for (const [key, value] of c.req.query() ? Object.entries(c.req.queries()) : []) {
    // c.req.queries() returns Record<string, string[]>, take first value
    params[key] = Array.isArray(value) ? value[0] : value;
  }

  // Simpler: just use the raw URL search params
  const url = new URL(c.req.url);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  const steamId = await verifyCallback(queryParams);
  if (!steamId) {
    return c.text('Steam authentication failed', 401);
  }

  // Fetch Steam user info
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let profileUrl: string | null = null;
  let countryCode: string | null = null;

  if (STEAM_API_KEY) {
    try {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`
      );
      const data = await res.json() as {
        response: { players: Array<{ personaname?: string; avatarfull?: string; profileurl?: string; loccountrycode?: string }> };
      };
      const player = data.response?.players?.[0];
      if (player) {
        displayName = player.personaname || null;
        avatarUrl = player.avatarfull || null;
        profileUrl = player.profileurl || null;
        countryCode = player.loccountrycode || null;
      }
    } catch {
      // Non-fatal: proceed with just steamId
    }
  }

  // Upsert user
  const existing = db.select().from(users).where(eq(users.steam_id, steamId)).get();
  let userId: number;

  const nowUnix = Math.floor(Date.now() / 1000);

  if (existing) {
    db.update(users)
      .set({
        display_name: displayName ?? existing.display_name,
        avatar_url: avatarUrl ?? existing.avatar_url,
        profile_url: profileUrl ?? existing.profile_url,
        country_code: countryCode ?? existing.country_code,
        last_login: nowUnix,
      })
      .where(eq(users.id, existing.id))
      .run();
    userId = existing.id;
  } else {
    const result = db.insert(users).values({
      steam_id: steamId,
      display_name: displayName,
      avatar_url: avatarUrl,
      profile_url: profileUrl,
      country_code: countryCode,
      last_login: nowUnix,
    }).returning({ id: users.id }).get();
    userId = result.id;
  }

  // Create session and set cookie
  const token = createSession(userId);
  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  });

  const clientUrl = process.env.STEAM_REALM || 'http://localhost:5173';
  return c.redirect(clientUrl + '/');
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, 'session');
  if (token) {
    deleteSession(token);
  }
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const token = getCookie(c, 'session');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = getSession(token);
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    steamId: user.steam_id,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    profileUrl: user.profile_url,
  });
});

export default auth;
