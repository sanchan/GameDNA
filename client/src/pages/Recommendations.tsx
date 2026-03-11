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
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black mb-3">For You</h1>
          <p className="text-[var(--muted-foreground)]">
            Personalized picks based on your gaming taste
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || syncStatus === 'syncing'}
          className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <i className="fa-solid fa-arrows-rotate mr-2" />
          {generating ? 'Generating...' : 'Regenerate'}
        </button>
      </div>

      {loading || syncStatus === 'syncing' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {syncStatus === 'syncing' && (
            <div className="col-span-full text-center py-8 text-[var(--muted-foreground)]">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)] mb-3" />
              <p className="text-sm">Recommendations will be generated after sync completes...</p>
            </div>
          )}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-xl overflow-hidden">
              <div className="h-48 bg-[#1a1a1a] animate-pulse" />
              <div className="p-5 flex flex-col gap-3">
                <div className="h-6 w-3/4 bg-[#1a1a1a] rounded animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-[#1a1a1a] rounded animate-pulse" />
                  <div className="h-6 w-12 bg-[#1a1a1a] rounded animate-pulse" />
                </div>
                <div className="h-11 w-full bg-[#1a1a1a] rounded-lg animate-pulse" />
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
          <i className="fa-solid fa-wand-magic-sparkles text-4xl mb-4 block opacity-40" />
          <p className="text-lg mb-2">No recommendations yet.</p>
          <p className="text-sm">Hit "Regenerate" to get personalized suggestions!</p>
        </div>
      )}

      <WhyThisGame
        gameId={explainRec?.id ?? 0}
        gameName={explainRec?.game.name ?? ''}
        gameImage={explainRec?.game.headerImage}
        gameDeveloper={explainRec?.game.developers?.[0]}
        matchScore={explainRec?.score}
        open={explainRec !== null}
        onClose={() => setExplainRec(null)}
      />
    </div>
  );
}
