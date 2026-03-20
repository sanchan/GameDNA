import { useState, useEffect } from 'react';
import { useDb } from '../contexts/db-context';
import { explainWhyNot } from '../services/recommendation';

interface WhyNotResult {
  factors: { name: string; current: number; needed: number; description: string }[];
  summary: string;
}

export default function WhyNotThisGame({ gameId, onClose }: { gameId: number; onClose: () => void }) {
  const { userId } = useDb();
  const [result, setResult] = useState<WhyNotResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = explainWhyNot(userId, gameId);
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [userId, gameId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
            <i className="fa-solid fa-circle-question text-[var(--primary)]" />
            Why Not This Game?
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors">
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
          </div>
        ) : !result ? (
          <p className="text-sm text-[var(--text-muted)] py-4">Unable to analyze this game.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-body)]">{result.summary}</p>

            {result.factors.length > 0 ? (
              <div className="space-y-3">
                {result.factors.map((factor, i) => (
                  <div key={i} className="bg-[var(--background)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">{factor.name}</span>
                      {factor.needed > 0 && (
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          {factor.current}% / {factor.needed}% needed
                        </span>
                      )}
                    </div>
                    {factor.needed > 0 && (
                      <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (factor.current / factor.needed) * 100)}%`,
                            backgroundColor: factor.current >= factor.needed * 0.8
                              ? 'var(--primary)'
                              : factor.current >= factor.needed * 0.5
                              ? '#eab308'
                              : '#ef4444',
                          }}
                        />
                      </div>
                    )}
                    <p className="text-xs text-[var(--text-muted)]">{factor.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                <p className="text-sm text-green-400">
                  <i className="fa-solid fa-check-circle mr-2" />
                  This game scores well against your profile. Check your recommendations!
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
