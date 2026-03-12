import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, Link } from 'react-router';
import { useTranslation, Trans } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import type { SwipeDecision } from '../../../shared/types';
import type { Game } from '../../../shared/types';

interface SwipeEntry {
  id: number;
  game: Game;
  decision: string;
  swipedAt: number;
}

interface HistoryResponse {
  items: SwipeEntry[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 20;

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeAgo(unix: number): string {
  const seconds = Math.floor(Date.now() / 1000 - unix);
  if (seconds < 60) return i18n.t('history.timeAgo.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return i18n.t('history.timeAgo.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('history.timeAgo.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t('history.timeAgo.daysAgo', { count: days });
  return formatDate(unix);
}

export default function History() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<SwipeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState('newest');
  const [dateRange, setDateRange] = useState('all');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [filter, dateRange]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      if (filter !== 'all') params.set('decision', filter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (dateRange !== 'all') params.set('dateRange', dateRange);

      const data = await api.get<HistoryResponse>(`/history?${params}`);
      setEntries(data.items);
      setTotal(data.total);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [user, filter, debouncedSearch, page, dateRange]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleChangeDecision = async (entryId: number, newDecision: SwipeDecision) => {
    setUpdatingId(entryId);
    try {
      await api.post(`/history/${entryId}`, { decision: newDecision });
      if (filter !== 'all' && newDecision !== filter) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setTotal((t) => t - 1);
      } else {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, decision: newDecision } : e,
          ),
        );
      }
      toast(`Changed to ${newDecision}`, 'success');
    } catch {
      toast('Failed to update decision', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveEntry = async (entryId: number) => {
    setUpdatingId(entryId);
    try {
      await api.delete(`/history/${entryId}`);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setTotal((t) => t - 1);
      toast('Entry removed', 'success');
    } catch {
      toast('Failed to remove entry', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '10000');
      if (filter !== 'all') params.set('decision', filter);
      if (dateRange !== 'all') params.set('dateRange', dateRange);

      const data = await api.get<HistoryResponse>(`/history?${params}`);
      const csvRows = [
        ['Game', 'Decision', 'Date'].join(','),
        ...data.items.map((e) =>
          [
            `"${e.game.name.replace(/"/g, '""')}"`,
            e.decision,
            new Date(e.swipedAt * 1000).toISOString(),
          ].join(',')
        ),
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swipe-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`Exported ${data.items.length} entries`, 'success');
    } catch {
      toast('Failed to export history', 'error');
    }
  };

  // Compute decision summary counts from current data context
  const summary = useMemo(() => {
    const yes = entries.filter((e) => e.decision === 'yes').length;
    const maybe = entries.filter((e) => e.decision === 'maybe').length;
    const no = entries.filter((e) => e.decision === 'no').length;
    const totalSwipes = total;
    // Approximate this week count from loaded entries
    const oneWeekAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
    const thisWeek = entries.filter((e) => e.swipedAt >= oneWeekAgo).length;
    return { yes, maybe, no, totalSwipes, thisWeek };
  }, [entries, total]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3">{t('history.title')}</h1>
      <p className="text-[var(--muted-foreground)] text-lg max-w-3xl mb-8">
        {t('history.subtitle')}
      </p>

      {/* Search and Filters */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        {/* Search input */}
        <div className="relative mb-4">
          <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder={t('history.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* Filter selects */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--muted-foreground)] font-medium">{t('history.dateRange')}</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="all">{t('history.dateRangeOptions.allTime')}</option>
              <option value="7days">{t('history.dateRangeOptions.last7Days')}</option>
              <option value="30days">{t('history.dateRangeOptions.last30Days')}</option>
              <option value="3months">{t('history.dateRangeOptions.last3Months')}</option>
              <option value="6months">{t('history.dateRangeOptions.last6Months')}</option>
              <option value="year">{t('history.dateRangeOptions.lastYear')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--muted-foreground)] font-medium">{t('history.decisionType')}</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="all">{t('history.decisionOptions.allDecisions')}</option>
              <option value="yes">{t('history.decisionOptions.yesInterested')}</option>
              <option value="maybe">{t('history.decisionOptions.maybeConsider')}</option>
              <option value="no">{t('history.decisionOptions.noNotInterested')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--muted-foreground)] font-medium">{t('common.sortBy')}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="newest">{t('history.sortOptions.mostRecent')}</option>
              <option value="oldest">{t('history.sortOptions.oldestFirst')}</option>
              <option value="name">{t('history.sortOptions.nameAsc')}</option>
              <option value="name-desc">{t('history.sortOptions.nameDesc')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Decision Summary */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-bold mb-6">{t('history.decisionSummary')}</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Yes card */}
          <div className="bg-[#1a1a1a] border-2 border-green-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-thumbs-up text-green-500 text-xl" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-500">{t('history.yes')}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">{t('history.yesInterested')}</p>
                </div>
              </div>
              <div className="text-4xl font-black text-green-500">{summary.yes}</div>
            </div>
            <div className="w-full bg-[#242424] rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-500 h-full rounded-full transition-all"
                style={{ width: `${entries.length ? (summary.yes / entries.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              {t('history.ofTotalSwipes', { percent: entries.length ? Math.round((summary.yes / entries.length) * 100) : 0 })}
            </p>
          </div>

          {/* Maybe card */}
          <div className="bg-[#1a1a1a] border-2 border-yellow-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-minus text-yellow-500 text-xl" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-yellow-500">{t('history.maybe')}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">{t('history.maybeConsiderLater')}</p>
                </div>
              </div>
              <div className="text-4xl font-black text-yellow-500">{summary.maybe}</div>
            </div>
            <div className="w-full bg-[#242424] rounded-full h-3 overflow-hidden">
              <div
                className="bg-yellow-500 h-full rounded-full transition-all"
                style={{ width: `${entries.length ? (summary.maybe / entries.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              {t('history.ofTotalSwipes', { percent: entries.length ? Math.round((summary.maybe / entries.length) * 100) : 0 })}
            </p>
          </div>

          {/* No card */}
          <div className="bg-[#1a1a1a] border-2 border-red-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-thumbs-down text-red-500 text-xl" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-500">{t('history.no')}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">{t('history.noNotInterested')}</p>
                </div>
              </div>
              <div className="text-4xl font-black text-red-500">{summary.no}</div>
            </div>
            <div className="w-full bg-[#242424] rounded-full h-3 overflow-hidden">
              <div
                className="bg-red-500 h-full rounded-full transition-all"
                style={{ width: `${entries.length ? (summary.no / entries.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              {t('history.ofTotalSwipes', { percent: entries.length ? Math.round((summary.no / entries.length) * 100) : 0 })}
            </p>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-[#333]">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">{t('history.totalSwipes')}</p>
              <p className="text-2xl font-black">{summary.totalSwipes}</p>
            </div>
            <div className="h-12 w-px bg-[#333]" />
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">{t('history.thisWeek')}</p>
              <p className="text-2xl font-black text-[var(--primary)]">{summary.thisWeek}</p>
            </div>
            <div className="h-12 w-px bg-[#333]" />
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">{t('history.avgPerDay')}</p>
              <p className="text-2xl font-black">
                {summary.totalSwipes > 0 ? (summary.thisWeek / 7).toFixed(1) : '0'}
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-5 py-3 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all cursor-pointer"
          >
            <i className="fa-solid fa-download" />
            <span>{t('history.exportHistory')}</span>
          </button>
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          {t('common.results', { count: total })}
          {debouncedSearch && ` for "${debouncedSearch}"`}
        </p>
      )}

      {/* History list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-xl p-4 flex items-center gap-4">
              <div className="w-32 h-20 bg-[#333] rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-1/3 bg-[#333] rounded animate-pulse" />
                <div className="h-4 w-1/4 bg-[#333] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          {debouncedSearch || filter !== 'all' ? (
            <>
              <i className="fa-solid fa-search text-4xl mb-4 block opacity-30" />
              <p className="text-lg mb-2">{t('history.noMatchingSwipes')}</p>
              <p className="text-sm">{t('history.tryDifferentSearch')}</p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                <i className="fa-solid fa-clock-rotate-left text-3xl text-[var(--primary)]" />
              </div>
              <p className="text-xl font-semibold text-[var(--foreground)] mb-2">{t('history.noSwipeHistory')}</p>
              <p className="text-sm mb-6 max-w-md mx-auto">{t('history.noSwipeHistoryDescription')}</p>
              <Link
                to="/discover"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--primary)] hover:opacity-80 text-[var(--primary-foreground)] rounded-lg font-semibold transition-all"
              >
                <i className="fa-solid fa-compass" />
                <span>{t('history.startDiscovering')}</span>
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {entries.map((entry) => {
              const otherDecisions = (['yes', 'maybe', 'no'] as SwipeDecision[]).filter(
                (d) => d !== entry.decision,
              );

              return (
                <div
                  key={entry.id}
                  className="bg-[#242424] border border-[#333] rounded-xl p-4 hover:border-[var(--primary)] transition-all"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Thumbnail */}
                    <Link to={`/game/${entry.game.id}`} className="w-full sm:w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                      {entry.game.headerImage ? (
                        <img
                          src={entry.game.headerImage}
                          alt={entry.game.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#333] flex items-center justify-center">
                          <i className="fa-solid fa-gamepad text-[var(--muted-foreground)]" />
                        </div>
                      )}
                    </Link>

                    {/* Content */}
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <Link to={`/game/${entry.game.id}`} className="hover:underline">
                            <h3 className="font-bold text-xl truncate mb-2">{entry.game.name}</h3>
                          </Link>

                          {entry.game.genres.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              {entry.game.genres.slice(0, 3).map((genre) => (
                                <span key={genre} className="bg-[#1a1a1a] px-3 py-1 rounded-full text-xs font-medium">
                                  {genre}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Decision badge */}
                        <div className="shrink-0">
                          {entry.decision === 'yes' && (
                            <span className="bg-green-500/20 text-green-500 px-4 py-2 rounded-full font-bold text-sm inline-flex items-center gap-2">
                              <i className="fa-solid fa-thumbs-up" />
                              {t('history.yes')}
                            </span>
                          )}
                          {entry.decision === 'maybe' && (
                            <span className="bg-yellow-500/20 text-yellow-500 px-4 py-2 rounded-full font-bold text-sm inline-flex items-center gap-2">
                              <i className="fa-solid fa-minus" />
                              {t('history.maybe')}
                            </span>
                          )}
                          {entry.decision === 'no' && (
                            <span className="bg-red-500/20 text-red-500 px-4 py-2 rounded-full font-bold text-sm inline-flex items-center gap-2">
                              <i className="fa-solid fa-thumbs-down" />
                              {t('history.no')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-sm text-[var(--muted-foreground)]">
                          <i className="fa-solid fa-clock mr-1" />
                          {t('history.swiped', { time: timeAgo(entry.swipedAt) })}
                        </span>
                        <span className="text-[#555]">&bull;</span>
                        <span className="text-sm text-[var(--muted-foreground)]">
                          {formatDateTime(entry.swipedAt)}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {otherDecisions.map((d) => {
                          const config: Record<string, { label: string; icon: string; hoverBorder: string; hoverText: string }> = {
                            yes: { label: t('history.changeToYes'), icon: 'fa-thumbs-up', hoverBorder: 'hover:border-green-500', hoverText: 'hover:text-green-500' },
                            maybe: { label: t('history.changeToMaybe'), icon: 'fa-minus', hoverBorder: 'hover:border-yellow-500', hoverText: 'hover:text-yellow-500' },
                            no: { label: t('history.changeToNo'), icon: 'fa-thumbs-down', hoverBorder: 'hover:border-red-500', hoverText: 'hover:text-red-500' },
                          };
                          const c = config[d];
                          return (
                            <button
                              key={d}
                              onClick={() => handleChangeDecision(entry.id, d)}
                              disabled={updatingId === entry.id}
                              className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] font-semibold transition-all disabled:opacity-50 ${c.hoverBorder} ${c.hoverText}`}
                            >
                              <i className={`fa-solid ${c.icon}`} />
                              <span>{c.label}</span>
                            </button>
                          );
                        })}

                        <Link
                          to={`/game/${entry.game.id}`}
                          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] font-semibold hover:border-[var(--primary)] transition-all"
                        >
                          <i className="fa-solid fa-eye" />
                          <span>{t('history.viewGame')}</span>
                        </Link>

                        <button
                          onClick={() => handleRemoveEntry(entry.id)}
                          disabled={updatingId === entry.id}
                          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] font-semibold hover:border-red-500 hover:text-red-500 transition-all disabled:opacity-50"
                        >
                          <i className="fa-solid fa-trash" />
                          <span>{t('common.remove')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg text-sm bg-[#242424] border border-[#333] text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-30 disabled:hover:border-[#333] transition-all"
              >
                <i className="fa-solid fa-chevron-left mr-1" />
                {t('common.prev')}
              </button>
              <span className="text-sm text-[var(--muted-foreground)]">
                {t('common.pageOf', { current: page + 1, total: totalPages })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-lg text-sm bg-[#242424] border border-[#333] text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-30 disabled:hover:border-[#333] transition-all"
              >
                {t('common.next')}
                <i className="fa-solid fa-chevron-right ml-1" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
