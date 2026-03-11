import crypto from 'crypto';
import { db } from '../db';
import { sessions } from '../db/schema';
import { eq } from 'drizzle-orm';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor((Date.now() + THIRTY_DAYS_MS) / 1000);

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
