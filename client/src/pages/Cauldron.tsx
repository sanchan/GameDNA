import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import * as queries from '../db/queries';
import { searchSteamStore } from '../services/steam-api';
import { cookCauldron, ensureInputGamesCached } from '../services/cauldron';
import type { CauldronResult } from '../services/cauldron';
import type { Game, Recommendation } from '../../../shared/types';
import GameGrid from '../components/GameGrid';

type Phase = 'input' | 'cooking' | 'results';

interface CauldronItem {
  id: number;
  name: string;
  headerImage: string;
}

const LS_ITEMS_KEY = 'cauldron_items';
const LS_RESULTS_KEY = 'cauldron_results';

function loadItems(): CauldronItem[] {
  try {
    const raw = localStorage.getItem(LS_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveItems(items: CauldronItem[]) {
  localStorage.setItem(LS_ITEMS_KEY, JSON.stringify(items));
}

function loadResults(): CauldronResult[] {
  try {
    const raw = localStorage.getItem(LS_RESULTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveResults(results: CauldronResult[]) {
  localStorage.setItem(LS_RESULTS_KEY, JSON.stringify(results));
}

function toRecommendation(r: CauldronResult): Recommendation {
  return {
    id: r.id,
    game: r.game,
    score: r.score,
    aiExplanation: r.explanation || null,
    generatedAt: Math.floor(Date.now() / 1000),
    source: r.source,
  };
}

export default function Cauldron() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [items, setItems] = useState<CauldronItem[]>(loadItems);
  const [results, setResults] = useState<CauldronResult[]>(loadResults);
  const [phase, setPhase] = useState<Phase>(() => loadResults().length > 0 ? 'results' : 'input');
  const [statusText, setStatusText] = useState('');

  // Search state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CauldronItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist items
  useEffect(() => { saveItems(items); }, [items]);
  useEffect(() => { saveResults(results); }, [results]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Search local DB first, then Steam Store
        const localResults = queries.searchGames(query, 5);
        const localItems: CauldronItem[] = localResults.map((g) => ({
          id: g.id,
          name: g.name,
          headerImage: g.headerImage ?? '',
        }));

        const storeResults = await searchSteamStore(query);
        const storeItems: CauldronItem[] = storeResults.map((r) => ({
          id: r.id,
          name: r.name,
          headerImage: r.headerImage,
        }));

        // Merge, deduplicate, prefer local
        const seen = new Set(localItems.map((i) => i.id));
        const merged = [...localItems];
        for (const item of storeItems) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }

        // Exclude items already in cauldron
        const cauldronIds = new Set(items.map((i) => i.id));
        setSearchResults(merged.filter((i) => !cauldronIds.has(i.id)).slice(0, 10));
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, items]);

  const addItem = useCallback((item: CauldronItem) => {
    setItems((prev) => {
      if (prev.find((i) => i.id === item.id)) return prev;
      return [...prev, item];
    });
    setQuery('');
    setSearchResults([]);
    inputRef.current?.focus();
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setResults([]);
    setPhase('input');
    localStorage.removeItem(LS_RESULTS_KEY);
  }, []);

  const cook = useCallback(async () => {
    if (items.length < 2) return;
    setPhase('cooking');
    setStatusText(t('cauldron.cachingGames'));

    try {
      // Ensure all input games are cached in DB
      await ensureInputGamesCached(items);

      // Get full Game objects from DB
      const inputGames: Game[] = [];
      for (const item of items) {
        const games = queries.searchGames(item.name, 1);
        const match = games.find((g) => g.id === item.id);
        if (match) inputGames.push(match);
      }

      if (inputGames.length < 2) {
        // Fallback: use items as partial games
        setStatusText(t('cauldron.notEnoughData'));
        setPhase('input');
        return;
      }

      const cookResults = await cookCauldron(inputGames, setStatusText);
      setResults(cookResults);
      setPhase('results');
    } catch (e) {
      console.error('[cauldron] Cook failed:', e);
      setStatusText(t('cauldron.cookFailed'));
      setTimeout(() => setPhase('input'), 2000);
    }
  }, [items, t]);

  const backToCauldron = useCallback(() => {
    setResults([]);
    setPhase('input');
    localStorage.removeItem(LS_RESULTS_KEY);
  }, []);

  if (!user) return null;

  // ── Cooking phase ──────────────────────────────────────────────────────────
  if (phase === 'cooking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="cauldron-animation relative w-32 h-32 mb-8">
          <i className="fa-solid fa-flask text-7xl text-purple-400 animate-pulse" />
          {/* Bubbles */}
          <div className="absolute -top-2 left-4 w-3 h-3 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="absolute -top-4 left-12 w-2 h-2 bg-green-400/60 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
          <div className="absolute -top-1 right-6 w-2.5 h-2.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: '0.6s' }} />
        </div>
        <p className="text-lg text-[var(--foreground)] font-medium mb-2">{t('cauldron.cooking')}</p>
        <p className="text-sm text-[var(--muted-foreground)]">{statusText}</p>
      </div>
    );
  }

  // ── Results phase ──────────────────────────────────────────────────────────
  if (phase === 'results' && results.length > 0) {
    const recs: Recommendation[] = results.map(toRecommendation);

    return (
      <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <i className="fa-solid fa-flask text-2xl text-purple-400" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">{t('cauldron.title')}</h1>
          </div>
          <p className="text-[var(--muted-foreground)]">
            {t('cauldron.resultsSubtitle', { count: results.length })}
          </p>

          {/* Show input games as small chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {items.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/15 text-purple-300 text-xs font-medium">
                <i className="fa-solid fa-flask text-[10px]" />
                {item.name}
              </span>
            ))}
          </div>
        </div>

        <GameGrid games={recs} />

        <div className="mt-8 flex justify-center">
          <button
            onClick={backToCauldron}
            className="px-6 py-3 rounded-xl bg-[#2a2a2a] text-[var(--foreground)] hover:bg-[#333] transition-colors font-medium"
          >
            <i className="fa-solid fa-arrow-left mr-2" />
            {t('cauldron.backToCauldron')}
          </button>
        </div>
      </div>
    );
  }

  // ── Input phase ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <i className="fa-solid fa-flask text-2xl text-purple-400" />
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">{t('cauldron.title')}</h1>
        </div>
        <p className="text-[var(--muted-foreground)]">{t('cauldron.subtitle')}</p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <div className="relative">
          <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('cauldron.searchPlaceholder')}
            className="w-full pl-11 pr-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-purple-500/50 transition-colors"
          />
          {searching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Search dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden shadow-xl max-h-80 overflow-y-auto">
            {searchResults.map((item) => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                {item.headerImage ? (
                  <img src={item.headerImage} alt="" className="w-16 h-8 object-cover rounded" />
                ) : (
                  <div className="w-16 h-8 bg-[#333] rounded flex items-center justify-center">
                    <i className="fa-solid fa-gamepad text-xs text-[var(--muted-foreground)]" />
                  </div>
                )}
                <span className="text-sm text-[var(--foreground)] truncate">{item.name}</span>
                <i className="fa-solid fa-plus ml-auto text-xs text-purple-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cauldron items */}
      <div className="mb-8">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <i className="fa-solid fa-flask text-5xl text-[var(--muted-foreground)]/30 mb-4" />
            <p className="text-[var(--muted-foreground)]">{t('cauldron.emptyState')}</p>
            <p className="text-sm text-[var(--muted-foreground)]/70 mt-1">{t('cauldron.emptyStateHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[var(--muted-foreground)]">
                {t('cauldron.gamesAdded', { count: items.length })}
              </span>
              <button
                onClick={clearAll}
                className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-trash-can mr-1" />
                {t('cauldron.clearAll')}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 pl-1 pr-2 py-1 bg-[#1a1a1a] border border-[#333] rounded-xl hover:border-purple-500/30 transition-colors"
                >
                  {item.headerImage ? (
                    <img src={item.headerImage} alt="" className="w-12 h-6 object-cover rounded-lg" />
                  ) : (
                    <div className="w-12 h-6 bg-[#333] rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-gamepad text-[10px] text-[var(--muted-foreground)]" />
                    </div>
                  )}
                  <span className="text-sm text-[var(--foreground)] max-w-[180px] truncate">{item.name}</span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="ml-1 w-5 h-5 flex items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
                    aria-label={t('common.remove')}
                  >
                    <i className="fa-solid fa-xmark text-xs" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cook button */}
      <button
        onClick={cook}
        disabled={items.length < 2}
        className="w-full py-4 rounded-xl font-bold text-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/20"
      >
        <i className="fa-solid fa-fire mr-2" />
        {items.length < 2
          ? t('cauldron.needMoreGames', { count: Math.max(0, 2 - items.length) })
          : t('cauldron.cookButton')
        }
      </button>
    </div>
  );
}
