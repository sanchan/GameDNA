import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/**
 * Vite plugin that replaces the standalone proxy server (server/proxy.ts).
 * Intercepts /api/steam/* requests and forwards them to the real Steam APIs,
 * injecting the API key from the x-steam-api-key header where needed.
 */
function steamProxyPlugin(): Plugin {
  return {
    name: 'steam-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/steam/')) return next();

        const reqUrl = new URL(req.url, `http://${req.headers.host}`);
        const path = reqUrl.pathname;
        const apiKey = req.headers['x-steam-api-key'] as string | undefined;
        let targetUrl: URL;

        if (path.startsWith('/api/steam/web/')) {
          const steamPath = path.slice('/api/steam/web/'.length);
          targetUrl = new URL(`https://api.steampowered.com/${steamPath}`);
          for (const [key, val] of reqUrl.searchParams) targetUrl.searchParams.set(key, val);
          if (apiKey) targetUrl.searchParams.set('key', apiKey);
        } else if (path.startsWith('/api/steam/store/')) {
          const steamPath = path.slice('/api/steam/store/'.length);
          targetUrl = new URL(`https://store.steampowered.com/api/${steamPath}`);
          for (const [key, val] of reqUrl.searchParams) targetUrl.searchParams.set(key, val);
        } else if (path.startsWith('/api/steam/tagdata/')) {
          const steamPath = path.slice('/api/steam/'.length);
          targetUrl = new URL(`https://store.steampowered.com/${steamPath}`);
        } else if (path.startsWith('/api/steam/reviews/')) {
          const appid = path.slice('/api/steam/reviews/'.length);
          targetUrl = new URL(`https://store.steampowered.com/appreviews/${appid}`);
          for (const [key, val] of reqUrl.searchParams) targetUrl.searchParams.set(key, val);
        } else {
          return next();
        }

        try {
          const upstream = await fetch(targetUrl.toString());
          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          const body = await upstream.text();
          res.end(body);
        } catch {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), steamProxyPlugin()],
  root: './client',
  clearScreen: false,
  server: {
    port: 5173,
    host: process.env.TAURI_ENV_PLATFORM ? '0.0.0.0' : 'localhost',
  },
  build: {
    outDir: 'dist',
  },
});
