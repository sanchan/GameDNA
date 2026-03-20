import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from './Select';
import type { DiscoveryFilters, GamingDNA } from '../../../shared/types';

interface FilterPanelProps {
  filters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
  className?: string;
  dna?: GamingDNA | null;
}

const FALLBACK_TAGS = [
  'Singleplayer',
  'Multiplayer',
  'Co-op',
  'Story Rich',
  'Indie',
  'Atmospheric',
];

const RELEASE_DATE_OPTIONS = [
  { key: 'anyTime', value: '' },
  { key: 'last30Days', value: '30d' },
  { key: 'last6Months', value: '6m' },
  { key: 'lastYear', value: '1y' },
  { key: 'last5Years', value: '5y' },
];

export default function FilterPanel({ filters, onApply, className = '', dna }: FilterPanelProps) {
  const { t } = useTranslation();
  const [minPrice, setMinPrice] = useState<string>(filters.minPrice?.toString() ?? '');
  const [maxPrice, setMaxPrice] = useState<string>(filters.maxPrice?.toString() ?? '');
  const [minReviewScore, setMinReviewScore] = useState<number>(
    filters.minReviewScore ?? 0,
  );
  const [genres, setGenres] = useState<string>(filters.genres?.join(', ') ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(filters.tags ?? []);
  const [releaseDate, setReleaseDate] = useState<string>('');

  // Use user's top auto-computed tags (non-blacklisted, sorted by score) or fallback
  const popularTags = dna?.allTags
    ? dna.allTags
        .filter((t) => !t.blacklisted && t.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((t) => t.name)
    : FALLBACK_TAGS;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleApply = () => {
    const next: DiscoveryFilters = {};
    if (minPrice) next.minPrice = Number(minPrice);
    if (maxPrice) next.maxPrice = Number(maxPrice);
    if (minReviewScore > 0) next.minReviewScore = minReviewScore;
    if (genres.trim()) next.genres = genres.split(',').map((g) => g.trim()).filter(Boolean);
    if (selectedTags.length > 0) next.tags = selectedTags;
    if (releaseDate) {
      const now = new Date();
      let date: Date;
      switch (releaseDate) {
        case '30d':
          date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
          break;
        case '6m':
          date = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case '1y':
          date = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case '5y':
          date = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
          break;
        default:
          date = now;
      }
      next.releasedAfter = date.toISOString().split('T')[0];
    }
    onApply(next);
  };

  const handleReset = () => {
    setMinPrice('');
    setMaxPrice('');
    setMinReviewScore(0);
    setGenres('');
    setSelectedTags([]);
    setReleaseDate('');
    onApply({});
  };

  const activeCount = [
    minPrice,
    maxPrice,
    minReviewScore > 0,
    genres.trim(),
    selectedTags.length > 0,
    releaseDate,
  ].filter(Boolean).length;

  const inputClass =
    'w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--primary)] transition-colors';

  return (
    <div
      className={`bg-[var(--card)] w-80 overflow-y-auto ${className}`}
    >
      <div className="p-6 w-80">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center space-x-2">
            <i className="fa-solid fa-filter text-[var(--primary)]" />
            <span>{t('common.filters')}</span>
          </h2>
        </div>

        <div className="flex flex-col gap-0">
            {/* Price Range */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">{t('filterPanel.priceRange')}</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('filterPanel.minPrice')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</span>
                    <input
                      type="number"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      placeholder="0"
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('filterPanel.maxPrice')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</span>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder="0"
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Min Review Score */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">{t('filterPanel.minimumReviewScore')}</label>
              <input
                type="range"
                min="0"
                max="100"
                value={minReviewScore}
                onChange={(e) => setMinReviewScore(Number(e.target.value))}
                className="range-slider w-full"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[var(--text-muted)]">0%</span>
                <span className="text-sm font-bold text-[var(--primary)]">{minReviewScore}%</span>
                <span className="text-xs text-[var(--text-muted)]">100%</span>
              </div>
            </div>

            {/* Genres */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">{t('filterPanel.genres')}</label>
              <textarea
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder={t('filterPanel.genresPlaceholder')}
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('filterPanel.separateWithCommas')}</p>
            </div>

            {/* Your Top Tags */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">{t('filterPanel.yourTopTags')}</label>
              <div className="flex flex-wrap gap-2">
                {popularTags.map((tag) => {
                  const isActive = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 bg-[var(--background)] border rounded-full text-xs transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] ${
                        isActive
                          ? 'border-[var(--primary)] text-[var(--primary)]'
                          : 'border-[var(--border)]'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Release Date */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">{t('filterPanel.releaseDate')}</label>
              <Select
                value={releaseDate}
                onChange={setReleaseDate}
                size="sm"
                options={RELEASE_DATE_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: t(`filterPanel.releaseDateOptions.${opt.key}`),
                }))}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleApply}
                className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-[var(--primary-foreground)] font-semibold py-3 rounded-lg transition-opacity"
              >
                {t('filterPanel.applyFilters')}
              </button>
              <button
                onClick={handleReset}
                className="px-4 bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] rounded-lg transition-colors"
              >
                <i className="fa-solid fa-rotate-right" />
              </button>
            </div>

            {/* Active Filters */}
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--text-muted)] mb-2">{t('filterPanel.activeFilters')}</div>
              <div className="text-2xl font-bold text-[var(--primary)]">{activeCount}</div>
            </div>
          </div>
      </div>
    </div>
  );
}

export function useFilterCount(filters: DiscoveryFilters): number {
  return [
    filters.minPrice != null,
    filters.maxPrice != null,
    filters.minReviewScore != null && filters.minReviewScore > 0,
    filters.genres && filters.genres.length > 0,
    filters.tags && filters.tags.length > 0,
    filters.releasedAfter != null,
  ].filter(Boolean).length;
}
