import { useState, useEffect, useCallback } from 'react';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';

let globalIds = new Set<number>();
let globalListeners: Array<() => void> = [];

function notify() {
  globalListeners.forEach((fn) => fn());
}

export function useBookmarks() {
  const { userId } = useDb();
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
    if (!userId) return;
    const ids = queries.getBookmarkIds(userId);
    globalIds = new Set(ids);
    setBookmarkedIds(globalIds);
    setLoaded(true);
    notify();
  }, [userId]);

  const toggle = useCallback(async (gameId: number) => {
    if (!userId) return;

    const isBookmarked = globalIds.has(gameId);
    // Optimistic update
    if (isBookmarked) {
      globalIds.delete(gameId);
      queries.removeBookmark(userId, gameId);
    } else {
      globalIds.add(gameId);
      queries.addBookmark(userId, gameId);
    }
    notify();
  }, [userId]);

  const isBookmarked = useCallback((gameId: number) => bookmarkedIds.has(gameId), [bookmarkedIds]);

  return { isBookmarked, toggle, loaded };
}
