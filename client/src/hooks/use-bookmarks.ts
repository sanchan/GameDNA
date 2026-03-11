import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from './use-auth';

let globalIds = new Set<number>();
let globalListeners: Array<() => void> = [];

function notify() {
  globalListeners.forEach((fn) => fn());
}

export function useBookmarks() {
  const { user } = useAuth();
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(globalIds);
  const [loaded, setLoaded] = useState(globalIds.size > 0);

  useEffect(() => {
    const listener = () => setBookmarkedIds(new Set(globalIds));
    globalListeners.push(listener);
    return () => {
      globalListeners = globalListeners.filter((fn) => fn !== listener);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get<number[]>('/lists/bookmarks/ids')
      .then((ids) => {
        globalIds = new Set(ids);
        setBookmarkedIds(globalIds);
        setLoaded(true);
        notify();
      })
      .catch(() => {});
  }, [user]);

  const toggle = useCallback(async (gameId: number) => {
    const isBookmarked = globalIds.has(gameId);
    // Optimistic update
    if (isBookmarked) {
      globalIds.delete(gameId);
    } else {
      globalIds.add(gameId);
    }
    notify();

    try {
      if (isBookmarked) {
        await api.delete(`/lists/bookmarks/${gameId}`);
      } else {
        await api.post(`/lists/bookmarks/${gameId}`);
      }
    } catch {
      // Revert on error
      if (isBookmarked) {
        globalIds.add(gameId);
      } else {
        globalIds.delete(gameId);
      }
      notify();
    }
  }, []);

  const isBookmarked = useCallback((gameId: number) => bookmarkedIds.has(gameId), [bookmarkedIds]);

  return { isBookmarked, toggle, loaded };
}
