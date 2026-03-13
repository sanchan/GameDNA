import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import { useGamingDNA } from '../hooks/use-profile';
import * as queries from '../db/queries';
import { DEFAULT_BLACKLISTED_TAGS } from '../services/tag-filter';

export default function Filters() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { userId } = useDb();
  const { data: dna, refetch: refetchDna } = useGamingDNA();

  const [search, setSearch] = useState('');
  const [blacklistOverrides, setBlacklistOverrides] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const isBlacklisted = useCallback(
    (tag: { name: string; blacklisted: boolean }) =>
      tag.name in blacklistOverrides ? blacklistOverrides[tag.name] : tag.blacklisted,
    [blacklistOverrides],
  );

  const handleRemoveFromBlacklist = useCallback(
    (tagName: string) => {
      if (!userId) return;
      setBlacklistOverrides((prev) => ({ ...prev, [tagName]: false }));
      try {
        queries.setTagBlacklisted(userId, tagName, false);
      } catch {
        setBlacklistOverrides((prev) => ({ ...prev, [tagName]: true }));
      }
    },
    [userId],
  );

  const handleAddToBlacklist = useCallback(
    (tagName: string) => {
      if (!userId) return;
      setBlacklistOverrides((prev) => ({ ...prev, [tagName]: true }));
      try {
        queries.setTagBlacklisted(userId, tagName, true);
      } catch {
        setBlacklistOverrides((prev) => ({ ...prev, [tagName]: false }));
      }
    },
    [userId],
  );

  const handleResetToDefaults = useCallback(() => {
    if (!userId) return;
    const allTags = dna?.allTags ?? [];
    const defaultSet = new Set(DEFAULT_BLACKLISTED_TAGS.map((t) => t.toLowerCase()));
    const overrides: Record<string, boolean> = {};
    for (const tag of allTags) {
      overrides[tag.name] = defaultSet.has(tag.name.toLowerCase());
    }
    setBlacklistOverrides(overrides);
    try {
      queries.resetBlacklistToDefaults(userId);
    } catch {
      setBlacklistOverrides({});
    }
  }, [userId, dna]);

  // Split tags into blacklisted and auto-computed
  const { blacklistedTags, autoTags, searchResults } = useMemo(() => {
    const allTags = dna?.allTags ?? [];
    const searchLower = search.toLowerCase().trim();

    const bl = allTags.filter((tag) => isBlacklisted(tag));
    const auto = allTags
      .filter((tag) => !isBlacklisted(tag))
      .sort((a, b) => b.score - a.score || b.count - a.count);

    // Search results: non-blacklisted tags matching search (for adding to blacklist)
    const results = searchLower
      ? allTags.filter(
          (tag) =>
            tag.name.toLowerCase().includes(searchLower) && !isBlacklisted(tag),
        )
      : [];

    return { blacklistedTags: bl, autoTags: auto, searchResults: results };
  }, [dna?.allTags, search, isBlacklisted]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const scoreBar = (score: number) => {
    const pct = Math.round(score * 100);
    return (
      <div className="flex items-center gap-2 min-w-[80px]">
        <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 tabular-nums w-8 text-right">
          {pct > 0 ? `${pct}%` : '–'}
        </span>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white mb-2">{t('filters.title')}</h1>
        <p className="text-gray-400 text-sm">{t('filters.subtitle')}</p>
      </div>

      {/* Section 1: Blacklist Management */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
              <i className="fa-solid fa-ban text-red-400 text-sm" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{t('filters.blacklistTitle')}</h2>
              <p className="text-xs text-gray-500">{t('filters.blacklistSubtitle')}</p>
            </div>
          </div>
          <button
            onClick={handleResetToDefaults}
            className="px-3 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-xs font-medium transition-all text-gray-400 hover:text-white"
          >
            <i className="fa-solid fa-rotate-right mr-1.5" />
            {t('filters.resetDefaults')}
          </button>
        </div>

        {/* Search to add tags to blacklist */}
        <div className="relative mb-4">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('filters.searchToBlacklist')}
            className="w-full bg-[#242424] border border-[#333] rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-red-500/50 transition-colors placeholder:text-gray-500"
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

        {/* Search results dropdown */}
        {search && searchResults.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl mb-4 max-h-48 overflow-y-auto">
            {searchResults.slice(0, 10).map((tag) => (
              <button
                key={tag.name}
                onClick={() => {
                  handleAddToBlacklist(tag.name);
                  setSearch('');
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-red-500/10 transition-colors text-sm text-left"
              >
                <span className="text-gray-300">{tag.name}</span>
                <span className="text-xs text-red-400">
                  <i className="fa-solid fa-plus mr-1" />
                  {t('filters.addToBlacklist')}
                </span>
              </button>
            ))}
          </div>
        )}

        {search && searchResults.length === 0 && (
          <p className="text-xs text-gray-500 mb-4">{t('filters.noTagsFound')}</p>
        )}

        {/* Blacklisted tag chips */}
        {blacklistedTags.length === 0 ? (
          <div className="bg-[#242424] border border-[#333] rounded-2xl p-8 text-center">
            <i className="fa-solid fa-check-circle text-2xl text-emerald-500/50 mb-2" />
            <p className="text-gray-400 text-sm">{t('filters.noBlacklistedTags')}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blacklistedTags.map((tag) => (
              <button
                key={tag.name}
                onClick={() => handleRemoveFromBlacklist(tag.name)}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
              >
                <span>{tag.name}</span>
                <i className="fa-solid fa-xmark text-xs opacity-50 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-600 mt-3">
          {t('filters.blacklistCount', { count: blacklistedTags.length })}
        </p>
      </div>

      {/* Section 2: Auto-computed tags (read-only) */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-[var(--primary)]/20 rounded-lg flex items-center justify-center">
            <i className="fa-solid fa-chart-simple text-[var(--primary)] text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{t('filters.autoTagsTitle')}</h2>
            <p className="text-xs text-gray-500">{t('filters.autoTagsSubtitle')}</p>
          </div>
        </div>

        {autoTags.length === 0 ? (
          <div className="bg-[#242424] border border-[#333] rounded-2xl p-8 text-center">
            <i className="fa-solid fa-chart-line text-2xl text-gray-600 mb-2" />
            <p className="text-gray-400 text-sm">{t('filters.noAutoTags')}</p>
          </div>
        ) : (
          <div className="bg-[#242424] border border-[#333] rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2.5 border-b border-[#333] text-xs text-gray-500 font-medium">
              <span>{t('filters.tagName')}</span>
              <span className="text-right">{t('filters.games')}</span>
              <span className="w-[80px]">{t('filters.score')}</span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {autoTags.map((tag, i) => (
                <div
                  key={tag.name}
                  className={`grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2.5 items-center ${
                    i < autoTags.length - 1 ? 'border-b border-[#222]' : ''
                  }`}
                >
                  <span className="text-sm text-gray-300 truncate">{tag.name}</span>
                  <span className="text-xs text-gray-500 tabular-nums text-right">
                    {tag.count}
                  </span>
                  {scoreBar(tag.score)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
