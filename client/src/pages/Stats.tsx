import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, Link } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import type { DashboardStats, YearInReview, ProfileComparison } from '../../../shared/types';

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Stats() {
  const { user, loading: authLoading } = useAuth();
  const { userId } = useDb();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [yearReview, setYearReview] = useState<YearInReview | null>(null);
  const [comparison, setComparison] = useState<ProfileComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'dashboard' | 'year' | 'compare'>('dashboard');
  const [reviewYear, setReviewYear] = useState(new Date().getFullYear());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !userId) return;
    try {
      const s = queries.getDashboardStats(userId);
      setStats(s);
    } catch { /* ignore */ }
    setLoading(false);
  }, [user, userId]);

  const loadYearReview = useCallback((year: number) => {
    if (!userId) return;
    setReviewYear(year);
    try {
      // Build year-in-review from local swipe history
      const allSwipes = queries.getSwipeHistory(userId, { limit: 100000 });
      const yearStart = new Date(year, 0, 1).getTime() / 1000;
      const yearEnd = new Date(year + 1, 0, 1).getTime() / 1000;
      const yearSwipes = allSwipes.filter((s) => s.swipedAt >= yearStart && s.swipedAt < yearEnd);

      const genreSet = new Set<string>();
      const genreCounts: Record<string, number> = {};
      for (const s of yearSwipes) {
        if (s.game) {
          for (const g of s.game.genres) {
            genreSet.add(g);
            genreCounts[g] = (genreCounts[g] || 0) + 1;
          }
        }
      }

      const topGenre = Object.entries(genreCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'N/A';
      const discoveries = yearSwipes.filter((s) => s.decision === 'yes').length;

      // Monthly activity
      const monthlyMap: Record<string, number> = {};
      for (const s of yearSwipes) {
        const month = new Date(s.swipedAt * 1000).toISOString().slice(0, 7);
        monthlyMap[month] = (monthlyMap[month] || 0) + 1;
      }
      const monthlyActivity = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, swipes]) => ({ month, swipes }));

      // Top played from library for this year
      const lib = queries.getLibrary(userId, { limit: 1000 });
      const topPlayedGame = lib.sort((a, b) => b.playtimeMins - a.playtimeMins)[0] ?? null;

      const swipeBreakdown = {
        yes: yearSwipes.filter((s) => s.decision === 'yes').length,
        no: yearSwipes.filter((s) => s.decision === 'no').length,
        maybe: yearSwipes.filter((s) => s.decision === 'maybe').length,
      };

      const review: YearInReview = {
        year,
        totalSwipes: yearSwipes.length,
        totalDiscoveries: discoveries,
        genresExplored: genreSet.size,
        topGenre,
        topPlayedGame: topPlayedGame ? { game: topPlayedGame.game, playtimeMins: topPlayedGame.playtimeMins } : null,
        monthlyActivity,
        swipeBreakdown,
        profileEvolution: { start: {}, end: {} },
      };
      setYearReview(review);
    } catch { setYearReview(null); }
  }, [userId]);

  useEffect(() => {
    if (tab === 'year') loadYearReview(reviewYear);
  }, [tab]);

  const handleCompare = useCallback(async (file: File) => {
    if (!userId) return;
    try {
      const text = await file.text();
      const profile2 = JSON.parse(text);
      // Get local gaming DNA
      const myDna = queries.getGamingDNA(userId);
      const myGenres = myDna.topGenres.map((g) => g.name.toLowerCase());
      const theirGenres: string[] = (profile2.topGenres || []).map((g: any) => (g.name || g).toLowerCase());

      const sharedGenres = myGenres.filter((g) => theirGenres.includes(g));
      const uniqueToUser1 = myGenres.filter((g) => !theirGenres.includes(g));
      const uniqueToUser2 = theirGenres.filter((g: string) => !myGenres.includes(g));
      const totalGenres = new Set([...myGenres, ...theirGenres]).size;
      const similarity = totalGenres > 0 ? Math.round((sharedGenres.length / totalGenres) * 100) : 0;

      setComparison({
        similarity,
        sharedGenres,
        uniqueToUser1,
        uniqueToUser2,
        user1: { name: user?.displayName || 'You', topGenres: myDna.topGenres },
        user2: { name: profile2.name || 'Friend', topGenres: profile2.topGenres || [] },
      });
    } catch { /* ignore */ }
    if (fileRef.current) fileRef.current.value = '';
  }, [user, userId]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-2">Statistics Dashboard</h1>
        <p className="text-[var(--text-muted)]">Insights into your gaming library and activity</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {(['dashboard', 'year', 'compare'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)]'}`}
          >
            {t === 'dashboard' ? 'Dashboard' : t === 'year' ? 'Year in Review' : 'Compare Profiles'}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        loading || !stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 animate-pulse">
                <div className="h-10 w-20 bg-[var(--muted)] rounded mb-2" />
                <div className="h-4 w-16 bg-[var(--muted)] rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                <div className="text-3xl font-black text-blue-400 mb-1">{stats.totalGames}</div>
                <div className="text-sm text-[var(--text-muted)]">Total Games</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                <div className="text-3xl font-black text-purple-400 mb-1">{stats.totalPlaytimeHours.toLocaleString()}h</div>
                <div className="text-sm text-[var(--text-muted)]">Total Playtime</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                <div className="text-3xl font-black text-green-400 mb-1">{formatPrice(stats.totalValueCents)}</div>
                <div className="text-sm text-[var(--text-muted)]">Library Value</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                <div className="text-3xl font-black text-amber-400 mb-1">{stats.swipeStats.yes + stats.swipeStats.no + stats.swipeStats.maybe}</div>
                <div className="text-sm text-[var(--text-muted)]">Total Swipes</div>
              </div>
            </div>

            {/* Played vs Unplayed */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Played vs Unplayed</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-green-400">Played ({stats.playedVsUnplayed.played})</span>
                    <span className="text-red-400">Unplayed ({stats.playedVsUnplayed.unplayed})</span>
                  </div>
                  <div className="h-4 bg-[var(--muted)] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-green-500 rounded-l-full"
                      style={{ width: `${stats.totalGames > 0 ? (stats.playedVsUnplayed.played / stats.totalGames * 100) : 0}%` }}
                    />
                    <div className="h-full bg-red-500 rounded-r-full flex-1" />
                  </div>
                </div>
              </div>
            </div>

            {/* Games by Genre */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Games by Genre</h3>
              <div className="space-y-3">
                {stats.gamesByGenre.slice(0, 10).map((item) => {
                  const maxCount = stats.gamesByGenre[0]?.count ?? 1;
                  return (
                    <div key={item.genre} className="flex items-center gap-3">
                      <span className="w-28 text-sm text-[var(--text-body)] truncate">{item.genre}</span>
                      <div className="flex-1 h-6 bg-[var(--muted)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--primary)] rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${(item.count / maxCount) * 100}%`, minWidth: '2rem' }}
                        >
                          <span className="text-[10px] font-bold">{item.count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Games by Year */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Games by Release Year</h3>
              <div className="flex items-end gap-1 h-40">
                {stats.gamesByYear.slice(-20).map((item) => {
                  const maxCount = Math.max(...stats.gamesByYear.map((y) => y.count));
                  return (
                    <div key={item.year} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-[var(--primary)]/60 rounded-t hover:bg-[var(--primary)] transition-colors"
                        style={{ height: `${(item.count / maxCount) * 100}%`, minHeight: '2px' }}
                        title={`${item.year}: ${item.count} games`}
                      />
                      <span className="text-[8px] text-gray-500 rotate-[-45deg]">{item.year.slice(-2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Played Games */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Top 10 Most Played</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {stats.topPlayedGames.map((item) => (
                  <Link key={item.game.id} to={`/game/${item.game.id}`} className="group">
                    <div className="aspect-video rounded-lg overflow-hidden mb-2">
                      {item.game.headerImage ? (
                        <img src={item.game.headerImage} alt={item.game.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full bg-[var(--muted)] flex items-center justify-center"><i className="fa-solid fa-gamepad text-gray-500" /></div>
                      )}
                    </div>
                    <p className="text-xs font-semibold truncate">{item.game.name}</p>
                    <p className="text-[10px] text-gray-500">{Math.round(item.playtimeMins / 60)}h played</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Swipe Activity */}
            {stats.recentActivity.length > 0 && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Recent Swipe Activity</h3>
                <div className="flex items-end gap-1 h-32">
                  {stats.recentActivity.map((item) => {
                    const maxSwipes = Math.max(...stats.recentActivity.map((a) => a.swipes));
                    return (
                      <div key={item.date} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-green-500/60 rounded-t hover:bg-green-500 transition-colors"
                          style={{ height: `${(item.swipes / maxSwipes) * 100}%`, minHeight: '2px' }}
                          title={`${item.date}: ${item.swipes} swipes`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] text-gray-500">{stats.recentActivity[0]?.date}</span>
                  <span className="text-[10px] text-gray-500">{stats.recentActivity[stats.recentActivity.length - 1]?.date}</span>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Year in Review Tab */}
      {tab === 'year' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => loadYearReview(reviewYear - 1)} className="p-2 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--primary)]">
              <i className="fa-solid fa-chevron-left" />
            </button>
            <span className="text-2xl font-black">{reviewYear}</span>
            <button onClick={() => loadYearReview(reviewYear + 1)} className="p-2 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--primary)]">
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>

          {yearReview ? (
            <div className="space-y-6">
              {/* Hero stats */}
              <div className="bg-gradient-to-br from-purple-600/20 to-[var(--primary)]/20 border border-purple-500/30 rounded-2xl p-8 text-center">
                <h2 className="text-4xl font-black text-[var(--foreground)] mb-2">Your {yearReview.year} Gaming Year</h2>
                <p className="text-[var(--text-muted)]">Here's what your gaming year looked like</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
                  <div className="text-3xl font-black text-[var(--primary)] mb-1">{yearReview.totalSwipes}</div>
                  <div className="text-sm text-[var(--text-muted)]">Games Swiped</div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
                  <div className="text-3xl font-black text-green-400 mb-1">{yearReview.totalDiscoveries}</div>
                  <div className="text-sm text-[var(--text-muted)]">Discoveries</div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
                  <div className="text-3xl font-black text-purple-400 mb-1">{yearReview.genresExplored}</div>
                  <div className="text-sm text-[var(--text-muted)]">Genres Explored</div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
                  <div className="text-2xl font-black text-amber-400 mb-1">{yearReview.topGenre}</div>
                  <div className="text-sm text-[var(--text-muted)]">Top Genre</div>
                </div>
              </div>

              {/* Top played game */}
              {yearReview.topPlayedGame && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Most Played Game</h3>
                  <Link to={`/game/${yearReview.topPlayedGame.game.id}`} className="flex items-center gap-4 group">
                    {yearReview.topPlayedGame.game.headerImage && (
                      <img src={yearReview.topPlayedGame.game.headerImage} alt="" className="w-32 aspect-video rounded-lg object-cover" />
                    )}
                    <div>
                      <p className="font-bold text-lg group-hover:text-[var(--primary)] transition-colors">{yearReview.topPlayedGame.game.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">{Math.round(yearReview.topPlayedGame.playtimeMins / 60)} hours played</p>
                    </div>
                  </Link>
                </div>
              )}

              {/* Monthly activity */}
              {yearReview.monthlyActivity.length > 0 && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Monthly Activity</h3>
                  <div className="flex items-end gap-2 h-32">
                    {yearReview.monthlyActivity.map((item) => {
                      const max = Math.max(...yearReview.monthlyActivity.map((m) => m.swipes));
                      return (
                        <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-[var(--primary)]/60 rounded-t"
                            style={{ height: `${max > 0 ? (item.swipes / max) * 100 : 0}%`, minHeight: '2px' }}
                          />
                          <span className="text-[10px] text-gray-500">{item.month.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-12 text-center">
              <i className="fa-solid fa-calendar text-4xl text-gray-500 mb-4 block" />
              <p className="text-[var(--text-muted)]">Loading year in review...</p>
            </div>
          )}
        </div>
      )}

      {/* Compare Profiles Tab */}
      {tab === 'compare' && (
        <div className="space-y-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">Compare Gaming Profiles</h3>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Import a friend's exported GameDNA JSON file to compare your gaming tastes.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <i className="fa-solid fa-upload" />
              Import Profile to Compare
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCompare(f); }} />
          </div>

          {comparison && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-2xl p-8 text-center">
                <div className="text-6xl font-black text-[var(--foreground)] mb-2">{comparison.similarity}%</div>
                <div className="text-lg text-[var(--text-muted)]">Taste Similarity</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                  <h4 className="text-sm font-bold text-[var(--text-muted)] mb-3">Shared Genres</h4>
                  <div className="flex flex-wrap gap-2">
                    {comparison.sharedGenres.map((g) => (
                      <span key={g} className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">{g}</span>
                    ))}
                    {comparison.sharedGenres.length === 0 && <span className="text-gray-500 text-sm">None</span>}
                  </div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                  <h4 className="text-sm font-bold text-[var(--text-muted)] mb-3">Unique to {comparison.user1.name}</h4>
                  <div className="flex flex-wrap gap-2">
                    {comparison.uniqueToUser1.map((g) => (
                      <span key={g} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">{g}</span>
                    ))}
                  </div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
                  <h4 className="text-sm font-bold text-[var(--text-muted)] mb-3">Unique to {comparison.user2.name}</h4>
                  <div className="flex flex-wrap gap-2">
                    {comparison.uniqueToUser2.map((g) => (
                      <span key={g} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">{g}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
