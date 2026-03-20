// Lightweight error logging service — writes to SQLite error_log table.
// Replaces silent catch {} blocks with structured error logging.
// All data stays local (privacy-first).

import * as queries from '../db/queries';

type ErrorLevel = 'error' | 'warn' | 'info';

interface ErrorLogEntry {
  source: string;
  message: string;
  context?: string;
  level?: ErrorLevel;
}

/** Log an error to the SQLite error_log table. */
export function logAppError(entry: ErrorLogEntry): void {
  try {
    queries.logError(entry.source, entry.message, entry.context, entry.level ?? 'error');
  } catch {
    // If DB isn't ready, fall back to console
    console.error(`[${entry.source}]`, entry.message, entry.context);
  }
}

/** Convenience: log a caught error with source context. */
export function logCaughtError(source: string, error: unknown, context?: string): void {
  const message = error instanceof Error ? error.message : String(error);
  logAppError({ source, message, context, level: 'error' });
}

/** Convenience: log a warning. */
export function logWarning(source: string, message: string, context?: string): void {
  logAppError({ source, message, context, level: 'warn' });
}
