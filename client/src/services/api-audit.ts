// API call audit log — records every external API call for transparency.
// Stored in memory (not persisted) to avoid bloating the DB.
// Users can view this log in Settings to see exactly what data was sent.

export interface ApiAuditEntry {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  status: number | null;
  direction: 'outbound';
  durationMs: number;
  error?: string;
}

const MAX_ENTRIES = 500;
let entries: ApiAuditEntry[] = [];
let nextId = 1;
let listeners: Array<() => void> = [];
// Stable snapshot reference — only replaced when entries change.
// useSyncExternalStore compares with Object.is, so returning a new
// array on every getAuditLog() call would cause infinite re-renders.
let snapshot: ApiAuditEntry[] = [];

function notify(): void {
  snapshot = [...entries];
  for (const fn of listeners) fn();
}

export function logApiCall(entry: Omit<ApiAuditEntry, 'id' | 'direction'>): void {
  entries.push({
    ...entry,
    id: nextId++,
    direction: 'outbound',
  });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  notify();
}

export function getAuditLog(): ApiAuditEntry[] {
  return snapshot;
}

export function clearAuditLog(): void {
  entries = [];
  nextId = 1;
  notify();
}

export function subscribeAuditLog(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
