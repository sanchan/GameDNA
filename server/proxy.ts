// Micro-proxy: ~80 lines. Forwards Steam API requests from the browser,
// attaching the API key from the x-steam-api-key header.

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors({ origin: '*' }));

// Web API proxy: /api/steam/web/* → api.steampowered.com/*
app.all('/api/steam/web/*', async (c) => {
  const apiKey = c.req.header('x-steam-api-key') ?? '';
  const path = c.req.path.replace('/api/steam/web/', '');
  const url = new URL(`https://api.steampowered.com/${path}`);

  // Forward query params and inject API key
  const reqUrl = new URL(c.req.url);
  for (const [key, val] of reqUrl.searchParams) {
    url.searchParams.set(key, val);
  }
  if (apiKey) url.searchParams.set('key', apiKey);

  try {
    const res = await fetch(url.toString());
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return c.json({ error: 'Proxy error' }, 502);
  }
});

// Store API proxy: /api/steam/store/* → store.steampowered.com/api/*
app.all('/api/steam/store/*', async (c) => {
  const path = c.req.path.replace('/api/steam/store/', '');
  const reqUrl = new URL(c.req.url);
  const url = new URL(`https://store.steampowered.com/api/${path}`);

  for (const [key, val] of reqUrl.searchParams) {
    url.searchParams.set(key, val);
  }

  try {
    const res = await fetch(url.toString());
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return c.json({ error: 'Proxy error' }, 502);
  }
});

// Tag data proxy: /api/steam/tagdata/* → store.steampowered.com/tagdata/*
app.all('/api/steam/tagdata/*', async (c) => {
  const path = c.req.path.replace('/api/steam/tagdata/', '');
  const url = new URL(`https://store.steampowered.com/tagdata/${path}`);

  try {
    const res = await fetch(url.toString());
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return c.json({ error: 'Proxy error' }, 502);
  }
});

// Reviews proxy: /api/steam/reviews/:appid → store.steampowered.com/appreviews/:appid
app.all('/api/steam/reviews/:appid', async (c) => {
  const appid = c.req.param('appid');
  const reqUrl = new URL(c.req.url);
  const url = new URL(`https://store.steampowered.com/appreviews/${appid}`);

  for (const [key, val] of reqUrl.searchParams) {
    url.searchParams.set(key, val);
  }

  try {
    const res = await fetch(url.toString());
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return c.json({ error: 'Proxy error' }, 502);
  }
});

const port = Number(process.env.PROXY_PORT) || 3000;
console.log(`Steam proxy running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
