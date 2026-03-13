import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import { useGamingDNA } from '../hooks/use-profile';
import * as queries from '../db/queries';
import { DEFAULT_IGNORED_TAGS } from '../services/tag-filter';

type ViewMode = 'all' | 'active' | 'ignored';

export default function Filters() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { userId } = useDb();
  const { data: dna, refetch: refetchDna } = useGamingDNA();

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [ignoredOverrides, setIgnoredOverrides] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const isTagIgnored = useCallback(
    (tag: { name: string; ignored: boolean }) =>
      tag.name in ignoredOverrides ? ignoredOverrides[tag.name] : tag.ignored,
    [ignoredOverrides],
  );

  const handleToggleTag = useCallback(
    (tagName: string, currentlyIgnored: boolean) => {
      if (!userId) return;
      const newIgnored = !currentlyIgnored;
      setIgnoredOverrides((prev) => ({ ...prev, [tagName]: newIgnored }));
      try {
        queries.setTagIgnored(userId, tagName, newIgnored);
      } catch {
        setIgnoredOverrides((prev) => ({ ...prev, [tagName]: currentlyIgnored }));
      }
    },
    [userId],
  );

  const handleResetToDefaults = useCallback(() => {
    if (!userId) return;
    // Set all tags to not-ignored first, then apply defaults
    const allTags = dna?.allTags ?? [];
    const defaultSet = new Set(DEFAULT_IGNORED_TAGS.map((t) => t.toLowerCase()));
    const overrides: Record<string, boolean> = {};
    for (const tag of allTags) {
      const shouldIgnore = defaultSet.has(tag.name.toLowerCase());
      overrides[tag.name] = shouldIgnore;
    }
    setIgnoredOverrides(overrides);
    // Persist
    try {
      queries.resetIgnoredTagsToDefaults(userId);
    } catch {
      setIgnoredOverrides({});
    }
  }, [userId, dna]);

  const handleIgnoreAll = useCallback(() => {
    if (!userId || !dna) return;
    const overrides: Record<string, boolean> = {};
    for (const tag of dna.allTags) {
      overrides[tag.name] = true;
    }
    setIgnoredOverrides(overrides);
    try {
      queries.setAllTagsIgnored(userId, dna.allTags.map((t) => t.name));
    } catch {
      setIgnoredOverrides({});
    }
  }, [userId, dna]);

  const handleActivateAll = useCallback(() => {
    if (!userId || !dna) return;
    const overrides: Record<string, boolean> = {};
    for (const tag of dna.allTags) {
      overrides[tag.name] = false;
    }
    setIgnoredOverrides(overrides);
    try {
      queries.setAllTagsActive(userId);
    } catch {
      setIgnoredOverrides({});
    }
  }, [userId, dna]);

  // Filtered and sorted tags
  const { displayTags, activeTags, ignoredTags } = useMemo(() => {
    const allTags = dna?.allTags ?? [];
    const searchLower = search.toLowerCase().trim();

    // Apply search filter
    const searched = searchLower
      ? allTags.filter((tag) => tag.name.toLowerCase().includes(searchLower))
      : allTags;

    // Split into active/ignored
    const active = searched.filter((tag) => !isTagIgnored(tag));
    const ignored = searched.filter((tag) => isTagIgnored(tag));

    let display: typeof allTags;
    if (viewMode === 'active') display = active;
    else if (viewMode === 'ignored') display = ignored;
    else display = searched;

    return { displayTags: display, activeTags: active, ignoredTags: ignored };
  }, [dna?.allTags, search, viewMode, isTagIgnored]);

  // Counts (unfiltered by search)
  const totalCounts = useMemo(() => {
    const allTags = dna?.allTags ?? [];
    const active = allTags.filter((tag) => !isTagIgnored(tag)).length;
    const ignored = allTags.filter((tag) => isTagIgnored(tag)).length;
    return { total: allTags.length, active, ignored };
  }, [dna?.allTags, isTagIgnored]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white mb-2">{t('filters.title')}</h1>
        <p className="text-gray-400 text-sm">{t('filters.subtitle')}</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filters.searchPlaceholder')}
          className="w-full bg-[#242424] border border-[#333] rounded-xl pl-11 pr-10 py-3.5 text-sm focus:outline-none focus:border-[var(--primary)] transition-colors placeholder:text-gray-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        )}
      </div>

      {/* View mode tabs + bulk actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 bg-[#1a1a1a] rounded-xl p-1">
          {(['all', 'active', 'ignored'] as ViewMode[]).map((mode) => {
            const count =
              mode === 'all'
                ? totalCounts.total
                : mode === 'active'
                  ? totalCounts.active
                  : totalCounts.ignored;
            const isActive = viewMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t(`filters.viewMode.${mode}`)}
                <span
                  className={`ml-1.5 text-xs ${
                    isActive ? 'opacity-80' : 'opacity-50'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleResetToDefaults}
            className="px-3 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-xs font-medium transition-all text-gray-400 hover:text-white"
            title={t('filters.resetToDefaults')}
          >
            <i className="fa-solid fa-rotate-right mr-1.5" />
            {t('filters.resetDefaults')}
          </button>
          <button
            onClick={handleActivateAll}
            className="px-3 py-2 bg-[#1a1a1a] border border-[#333] hover:border-green-500/50 rounded-lg text-xs font-medium transition-all text-gray-400 hover:text-green-400"
            title={t('filters.activateAll')}
          >
            <i className="fa-solid fa-check-double mr-1.5" />
            {t('filters.activateAll')}
          </button>
          <button
            onClick={handleIgnoreAll}
            className="px-3 py-2 bg-[#1a1a1a] border border-[#333] hover:border-red-500/50 rounded-lg text-xs font-medium transition-all text-gray-400 hover:text-red-400"
            title={t('filters.ignoreAll')}
          >
            <i className="fa-solid fa-eye-slash mr-1.5" />
            {t('filters.ignoreAll')}
          </button>
        </div>
      </div>

      {/* Results count */}
      {search && (
        <p className="text-xs text-gray-500 mb-4">
          {t('filters.showingResults', {
            shown: displayTags.length,
            total: totalCounts.total,
          })}
        </p>
      )}

      {/* Tags grid */}
      {displayTags.length === 0 ? (
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-12 text-center">
          <i className="fa-solid fa-filter-circle-xmark text-3xl text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm">{t('filters.noTagsFound')}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {displayTags.map((tag) => {
            const ignored = isTagIgnored(tag);
            return (
              <button
                key={tag.name}
                onClick={() => handleToggleTag(tag.name, ignored)}
                className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-all cursor-pointer border ${
                  ignored
                    ? 'bg-red-500/5 border-red-500/20 text-red-400 hover:border-green-500/40 hover:bg-green-500/5 hover:text-green-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:border-red-500/40 hover:bg-red-500/5 hover:text-red-300'
                }`}
              >
                {/* Toggle indicator */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                    ignored
                      ? 'bg-red-500 group-hover:bg-green-500'
                      : 'bg-emerald-500 group-hover:bg-red-500'
                  }`}
                />
                <span className="whitespace-nowrap">{tag.name}</span>
                {tag.count > 0 && (
                  <span
                    className={`text-[10px] font-normal transition-colors ${
                      ignored ? 'text-red-400/50' : 'text-emerald-400/50'
                    }`}
                  >
                    {tag.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 flex items-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>{t('filters.legendActive')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>{t('filters.legendIgnored')}</span>
        </div>
        <div className="text-gray-600">|</div>
        <span>{t('filters.legendHint')}</span>
      </div>
    </div>
  );
}
