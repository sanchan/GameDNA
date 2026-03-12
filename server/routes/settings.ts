import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { user_settings } from '../db/schema';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const settingsRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// GET /api/settings
settingsRoutes.get('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const row = db.select().from(user_settings).where(eq(user_settings.user_id, session.userId)).get();

  if (!row) {
    return c.json({
      theme: 'dark',
      backupDir: null,
      backupIntervalHours: 24,
      ollamaUrl: null,
      ollamaModel: null,
      cacheTtlSeconds: null,
      language: 'en',
      keyboardShortcuts: null,
    });
  }

  return c.json({
    theme: row.theme ?? 'dark',
    backupDir: row.backup_dir,
    backupIntervalHours: row.backup_interval_hours ?? 24,
    ollamaUrl: row.ollama_url,
    ollamaModel: row.ollama_model,
    cacheTtlSeconds: row.cache_ttl_seconds,
    language: row.language ?? 'en',
    keyboardShortcuts: row.keyboard_shortcuts ? JSON.parse(row.keyboard_shortcuts) : null,
  });
});

// PUT /api/settings
settingsRoutes.put('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<Record<string, unknown>>();
  const now = Math.floor(Date.now() / 1000);

  db.insert(user_settings)
    .values({
      user_id: session.userId,
      theme: (body.theme as string) ?? 'dark',
      backup_dir: (body.backupDir as string) ?? null,
      backup_interval_hours: (body.backupIntervalHours as number) ?? 24,
      ollama_url: (body.ollamaUrl as string) ?? null,
      ollama_model: (body.ollamaModel as string) ?? null,
      cache_ttl_seconds: (body.cacheTtlSeconds as number) ?? null,
      language: (body.language as string) ?? 'en',
      keyboard_shortcuts: body.keyboardShortcuts ? JSON.stringify(body.keyboardShortcuts) : null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [user_settings.user_id],
      set: {
        ...(body.theme !== undefined ? { theme: body.theme as string } : {}),
        ...(body.backupDir !== undefined ? { backup_dir: body.backupDir as string } : {}),
        ...(body.backupIntervalHours !== undefined ? { backup_interval_hours: body.backupIntervalHours as number } : {}),
        ...(body.ollamaUrl !== undefined ? { ollama_url: body.ollamaUrl as string } : {}),
        ...(body.ollamaModel !== undefined ? { ollama_model: body.ollamaModel as string } : {}),
        ...(body.cacheTtlSeconds !== undefined ? { cache_ttl_seconds: body.cacheTtlSeconds as number } : {}),
        ...(body.language !== undefined ? { language: body.language as string } : {}),
        ...(body.keyboardShortcuts !== undefined ? { keyboard_shortcuts: body.keyboardShortcuts ? JSON.stringify(body.keyboardShortcuts) : null } : {}),
        updated_at: now,
      },
    })
    .run();

  return c.json({ success: true });
});

// POST /api/settings/backup — create a database backup
settingsRoutes.post('/backup', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const row = db.select().from(user_settings).where(eq(user_settings.user_id, session.userId)).get();
  const backupDir = row?.backup_dir || './data/backups';

  try {
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `gamedna-backup-${timestamp}.db`);
    const dbPath = './data/gamedna.db';

    if (existsSync(dbPath)) {
      copyFileSync(dbPath, backupPath);

      // Update last backup time
      db.update(user_settings)
        .set({ last_backup_at: Math.floor(Date.now() / 1000) })
        .where(eq(user_settings.user_id, session.userId))
        .run();

      return c.json({ success: true, path: backupPath });
    }

    return c.json({ error: 'Database file not found' }, 500);
  } catch (e) {
    return c.json({ error: 'Backup failed' }, 500);
  }
});

export default settingsRoutes;
