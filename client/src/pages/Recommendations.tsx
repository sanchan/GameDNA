import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import GameGrid from '../components/GameGrid';
import WhyThisGame from '../components/WhyThisGame';
import type { Recommendation } from '../../../shared/types';

export default function Recommendations() {
  const { user, loading: authLoading, syncStatus } = useAuth();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [explainRec, setExplainRec] = useState<Recommendation | null>(null);
  const prevSyncStatus = useRef(syncStatus);

  const fetchRecs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Recommendation[]>('/recommendations');
      setRecs(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchRecs();
  }, [user, fetchRecs]);

  // Refetch when sync transitions to 'synced' (recommendations are auto-generated during sync)
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      fetchRecs();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, fetchRecs]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post<{ count: number }>('/recommendations/generate');
      await fetchRecs();
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const handleExplain = (recId: number) => {
    const rec = recs.find((r) => r.id === recId);
    if (rec) setExplainRec(rec);
  };

  const handleDismiss = async (recId: number) => {
    try {
      await api.post(`/recommendations/${recId}/dismiss`);
      setRecs((prev) => prev.filter((r) => r.id !== recId));
    } catch {
      // ignore
    }
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Recommended For You</h1>
        <button
          onClick={handleGenerate}
          disabled={generating || syncStatus === 'syncing'}
          className="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Regenerate'}
        </button>
      </div>

      {loading || syncStatus === 'syncing' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {syncStatus === 'syncing' && (
            <div className="col-span-full text-center py-8 text-[var(--muted-foreground)]">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)] mb-3" />
              <p className="text-sm">Recommendations will be generated after sync completes...</p>
            </div>
          )}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-[var(--card)] shadow-lg">
              <div className="w-full aspect-video bg-[var(--muted)] animate-pulse" />
              <div className="p-4 flex flex-col gap-3">
                <div className="h-5 w-3/4 bg-[var(--muted)] rounded animate-pulse" />
                <div className="flex gap-1">
                  <div className="h-5 w-14 bg-[var(--muted)] rounded-full animate-pulse" />
                  <div className="h-5 w-10 bg-[var(--muted)] rounded-full animate-pulse" />
                </div>
                <div className="h-8 w-full bg-[var(--muted)] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : recs.length > 0 ? (
        <GameGrid
          games={recs}
          onExplain={handleExplain}
          onDismiss={handleDismiss}
        />
      ) : (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          <p className="text-lg mb-2">No recommendations yet.</p>
          <p className="text-sm">Hit "Regenerate" to get personalized suggestions!</p>
        </div>
      )}

      <WhyThisGame
        gameId={explainRec?.id ?? 0}
        gameName={explainRec?.game.name ?? ''}
        gameImage={explainRec?.game.headerImage}
        open={explainRec !== null}
        onClose={() => setExplainRec(null)}
      />
    </div>
  );
}
