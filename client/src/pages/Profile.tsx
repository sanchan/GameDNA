import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useProfile, useGamingDNA } from '../hooks/use-profile';
import { api } from '../lib/api';
import RadarChart from '../components/RadarChart';

export default function Profile() {
  const { user, loading: authLoading, syncStatus, triggerSync } = useAuth();
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useProfile();
  const { data: dna, isLoading: dnaLoading, refetch: refetchDna } = useGamingDNA();
  const prevSyncStatus = useRef(syncStatus);
  const [showAllTags, setShowAllTags] = useState(false);
  const [togglingTag, setTogglingTag] = useState<string | null>(null);

  // Refetch profile data when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      refetchProfile();
      refetchDna();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, refetchProfile, refetchDna]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const loading = profileLoading || dnaLoading;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-col items-center gap-6">
          <div className="h-20 w-20 rounded-full bg-[var(--muted)] animate-pulse" />
          <div className="h-6 w-48 bg-[var(--muted)] rounded animate-pulse" />
          <div className="flex gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 w-24 bg-[var(--muted)] rounded animate-pulse" />
            ))}
          </div>
          <div className="w-full max-w-lg h-[300px] bg-[var(--muted)] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const totalSwipes = dna
    ? dna.swipeStats.yes + dna.swipeStats.no + dna.swipeStats.maybe
    : 0;

  const handleToggleTag = async (tagName: string, currentlyIgnored: boolean) => {
    setTogglingTag(tagName);
    try {
      await api.post('/user/ignored-tags', { tag: tagName, ignored: !currentlyIgnored });
      refetchDna();
    } catch {
      // ignore
    } finally {
      setTogglingTag(null);
    }
  };

  const activeTags = dna?.allTags.filter((t) => !t.ignored) ?? [];
  const ignoredTags = dna?.allTags.filter((t) => t.ignored) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col items-center gap-6">
        {/* Avatar and Name */}
        <div className="flex flex-col items-center gap-3">
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={user.displayName ?? 'Avatar'}
              className="h-20 w-20 rounded-full border-2 border-[var(--border)]"
            />
          )}
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {user.displayName ?? 'Gamer'}
          </h1>
          <button
            onClick={() => triggerSync()}
            disabled={syncStatus === 'syncing'}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50 flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Steam Library'}
          </button>
        </div>

        {/* Stats Row */}
        <div className="flex gap-8 text-center">
          <div>
            <div className="text-2xl font-bold text-[var(--foreground)]">
              {dna?.totalGames ?? 0}
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">Games</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--foreground)]">
              {dna?.totalPlaytimeHours.toLocaleString() ?? 0}
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">Hours</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--foreground)]">
              {totalSwipes}
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">Swipes</div>
          </div>
        </div>

        {/* Radar Chart */}
        {dna && dna.topGenres.length > 0 && (
          <div className="w-full max-w-lg">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2 text-center">
              Gaming DNA
            </h2>
            <RadarChart data={dna.topGenres} />
          </div>
        )}

        {/* Top Tags */}
        {dna && dna.topTags.length > 0 && (
          <div className="w-full max-w-lg">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3 text-center">
              Top Tags
            </h2>
            <div className="flex flex-wrap gap-2 justify-center">
              {dna.topTags.map((tag) => (
                <span
                  key={tag.name}
                  className="px-3 py-1 rounded-full text-sm bg-[var(--muted)] text-[var(--foreground)]"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* All Tags Table */}
        {dna && dna.allTags.length > 0 && (
          <div className="w-full max-w-lg">
            <button
              onClick={() => setShowAllTags(!showAllTags)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
            >
              <span className="text-sm font-semibold text-[var(--foreground)]">
                All Tags ({activeTags.length} active, {ignoredTags.length} ignored)
              </span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform ${showAllTags ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showAllTags && (
              <div className="mt-2 rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left px-4 py-2 text-[var(--muted-foreground)] font-medium">Tag</th>
                        <th className="text-right px-4 py-2 text-[var(--muted-foreground)] font-medium w-20">Score</th>
                        <th className="text-center px-4 py-2 text-[var(--muted-foreground)] font-medium w-20">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dna.allTags.map((tag) => (
                        <tr
                          key={tag.name}
                          className={`border-b border-[var(--border)] last:border-0 ${tag.ignored ? 'opacity-50' : ''}`}
                        >
                          <td className="px-4 py-2 text-[var(--foreground)]">{tag.name}</td>
                          <td className="px-4 py-2 text-right text-[var(--muted-foreground)]">
                            {tag.score.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => handleToggleTag(tag.name, tag.ignored)}
                              disabled={togglingTag === tag.name}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50 ${
                                tag.ignored
                                  ? 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--destructive)] hover:text-white'
                                  : 'bg-green-500/15 text-green-500 hover:bg-red-500/15 hover:text-red-500'
                              }`}
                            >
                              {tag.ignored ? 'Ignored' : 'Active'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Summary */}
        {dna?.aiSummary && (
          <div className="w-full max-w-lg rounded-xl bg-[var(--card)] p-4 border border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              AI Summary
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              {dna.aiSummary}
            </p>
          </div>
        )}

        {/* Swipe History Stats */}
        {dna && totalSwipes > 0 && (
          <div className="w-full max-w-lg rounded-xl bg-[var(--card)] p-4 border border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">
              Swipe History
            </h2>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Yes', count: dna.swipeStats.yes, color: '#22c55e' },
                { label: 'Maybe', count: dna.swipeStats.maybe, color: '#eab308' },
                { label: 'No', count: dna.swipeStats.no, color: '#ef4444' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-12 text-sm text-[var(--muted-foreground)]">
                    {label}
                  </span>
                  <div className="flex-1 h-4 rounded-full bg-[var(--muted)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${totalSwipes > 0 ? (count / totalSwipes) * 100 : 0}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="w-8 text-sm text-[var(--muted-foreground)] text-right">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
