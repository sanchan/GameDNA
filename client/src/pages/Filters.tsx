import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import { useGamingDNA } from '../hooks/use-profile';
import * as queries from '../db/queries';
import { DEFAULT_BLACKLISTED_TAGS, TAG_COLLECTIONS } from '../services/tag-filter';

export default function Filters() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { userId, triggerSync, syncStatus } = useDb();
  const { data: dna, refetch: refetchDna } = useGamingDNA();

  const [search, setSearch] = useState('');
  const [blacklistOverrides, setBlacklistOverrides] = useState<Record<string, boolean>>({});
  const [catalogCount, setCatalogCount] = useState(() => queries.getTagCatalogCount());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Refresh catalog count after sync completes
  useEffect(() => {
    if (syncStatus === 'synced') {
      setCatalogCount(queries.getTagCatalogCount());
      refetchDna();
    }
  }, [syncStatus, refetchDna]);

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

  const handleSyncTags = useCallback(async () => {
    await triggerSync(['backlog', 'tags']);
  }, [triggerSync]);

  // Build blacklisted tags list and auto-computed tags
  const { blacklistedTags, autoTags } = useMemo(() => {
    const allTags = dna?.allTags ?? [];
    const allTagNames = new Set(allTags.map((t) => t.name.toLowerCase()));
    // Include optimistically-added tags that aren't yet in allTags (e.g. tags with 0 games)
    const extraBlacklisted = Object.entries(blacklistOverrides)
      .filter(([name, bl]) => bl && !allTagNames.has(name.toLowerCase()))
      .map(([name]) => ({ name, score: 0, blacklisted: true, count: 0 }));
    const combined = [...allTags, ...extraBlacklisted];
    const bl = combined.filter((tag) => isBlacklisted(tag))
      .sort((a, b) => a.name.localeCompare(b.name));
    const auto = allTags
      .filter((tag) => !isBlacklisted(tag))
      .sort((a, b) => b.score - a.score || b.count - a.count);
    return { blacklistedTags: bl, autoTags: auto };
  }, [dna?.allTags, isBlacklisted, blacklistOverrides]);

  // Derive collection toggle state from current blacklist
  const collectionStates = useMemo(() => {
    const blSet = new Set(blacklistedTags.map((t) => t.name.toLowerCase()));
    const states: Record<string, boolean> = {};
    for (const col of TAG_COLLECTIONS) {
      states[col.id] = col.tags.every((tag) => blSet.has(tag.toLowerCase()));
    }
    return states;
  }, [blacklistedTags]);

  const handleToggleCollection = useCallback(
    (colId: string) => {
      if (!userId) return;
      const col = TAG_COLLECTIONS.find((c) => c.id === colId);
      if (!col) return;
      const isEnabled = collectionStates[colId];
      for (const tag of col.tags) {
        if (isEnabled) {
          handleRemoveFromBlacklist(tag);
        } else {
          handleAddToBlacklist(tag);
        }
      }
    },
    [userId, collectionStates, handleRemoveFromBlacklist, handleAddToBlacklist],
  );

  // Search results from tag catalog (all known Steam tags, not just user's library)
  const catalogResults = useMemo(() => {
    const trimmed = search.trim();
    if (!trimmed) return [];
    const blacklistSet = new Set(blacklistedTags.map((t) => t.name.toLowerCase()));
    return queries.searchTagCatalog(trimmed, 15)
      .filter((t) => !blacklistSet.has(t.name.toLowerCase()));
  }, [search, blacklistedTags]);

  // Check if freeform entry is possible (search doesn't match any catalog result exactly)
  const canAddFreeform = useMemo(() => {
    const trimmed = search.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    // Don't offer freeform if already blacklisted
    if (blacklistedTags.some((t) => t.name.toLowerCase() === lower)) return false;
    // Don't offer freeform if exact match exists in catalog results
    if (catalogResults.some((t) => t.name.toLowerCase() === lower)) return false;
    return true;
  }, [search, blacklistedTags, catalogResults]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const isSyncing = syncStatus === 'syncing';

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white mb-2">{t('filters.title')}</h1>
          <p className="text-gray-400 text-sm">{t('filters.subtitle')}</p>
        </div>
        <button
          onClick={handleSyncTags}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-xl text-sm font-medium transition-all text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className={`fa-solid fa-arrows-rotate text-sm ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? t('filters.syncing') : t('filters.syncTags')}
        </button>
      </div>

      {/* Tag catalog info */}
      {catalogCount > 0 && (
        <p className="text-xs text-gray-600 mb-6">
          {t('filters.catalogInfo', { count: catalogCount })}
        </p>
      )}

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

        {/* Quick-toggle collections */}
        <div className="space-y-2 mb-5">
          {TAG_COLLECTIONS.map((col) => (
            <div
              key={col.id}
              className="flex items-center justify-between p-3 bg-[#1a1a1a] border border-[#333] rounded-xl"
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-white">{col.label}</p>
                <p className="text-xs text-gray-500 truncate">{col.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!collectionStates[col.id]}
                onClick={() => handleToggleCollection(col.id)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[#111] ${
                  collectionStates[col.id] ? 'bg-red-500' : 'bg-[#333]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    collectionStates[col.id] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Search to add tags to blacklist */}
        <div className="relative mb-4">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAddFreeform && search.trim()) {
                handleAddToBlacklist(search.trim());
                setSearch('');
              }
            }}
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
        {search && (catalogResults.length > 0 || canAddFreeform) && (
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl mb-4 max-h-60 overflow-y-auto">
            {/* Freeform entry option */}
            {canAddFreeform && (
              <button
                onClick={() => {
                  handleAddToBlacklist(search.trim());
                  setSearch('');
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-red-500/10 transition-colors text-sm text-left border-b border-[#333]"
              >
                <span className="text-white font-medium">
                  "{search.trim()}"
                </span>
                <span className="text-xs text-red-400">
                  <i className="fa-solid fa-plus mr-1" />
                  {t('filters.addCustom')}
                </span>
              </button>
            )}
            {/* Catalog results */}
            {catalogResults.map((tag) => (
              <button
                key={tag.name}
                onClick={() => {
                  handleAddToBlacklist(tag.name);
                  setSearch('');
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-red-500/10 transition-colors text-sm text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-300">{tag.name}</span>
                  <span className="text-[10px] text-gray-600">
                    {tag.gameCount} {tag.gameCount === 1 ? 'game' : 'games'}
                  </span>
                </div>
                <span className="text-xs text-red-400">
                  <i className="fa-solid fa-plus mr-1" />
                  {t('filters.addToBlacklist')}
                </span>
              </button>
            ))}
          </div>
        )}

        {search && catalogResults.length === 0 && !canAddFreeform && (
          <p className="text-xs text-gray-500 mb-4">{t('filters.alreadyBlacklisted')}</p>
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
