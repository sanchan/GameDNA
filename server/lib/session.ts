import crypto from 'crypto';
import { db } from '../db';
import { sessions } from '../db/schema';
import { eq, lt, sql } from 'drizzle-orm';
import { config } from '../config';

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor((Date.now() + config.sessionTtlMs) / 1000);

  db.insert(sessions).values({
    id: token,
    user_id: userId,
    expires_at: expiresAt,
  }).run();

  return token;
}

export function getSession(token: string): { userId: number } | null {
  const session = db.select().from(sessions).where(eq(sessions.id, token)).get();

  if (!session) return null;

  const nowUnix = Math.floor(Date.now() / 1000);
  if (session.expires_at < nowUnix) {
    // Expired — clean up
    deleteSession(token);
    return null;
  }

  return { userId: session.user_id };
}

export function deleteSession(token: string): void {
  db.delete(sessions).where(eq(sessions.id, token)).run();
}

/** Remove all expired sessions from the database. */
export function cleanupExpiredSessions(): number {
  const nowUnix = Math.floor(Date.now() / 1000);
  // Count expired sessions before deleting
  const countRow = db.select({ count: sql<number>`count(*)` }).from(sessions).where(lt(sessions.expires_at, nowUnix)).get();
  const count = countRow?.count ?? 0;
  if (count > 0) {
    db.delete(sessions).where(lt(sessions.expires_at, nowUnix)).run();
    console.log(`[session] Cleaned up ${count} expired sessions`);
  }
  return count;
}

/** Start periodic cleanup of expired sessions. */
export function startSessionCleanup(): void {
  // Run once on startup
  cleanupExpiredSessions();
  // Then periodically
  setInterval(cleanupExpiredSessions, config.sessionCleanupIntervalMs);
}
