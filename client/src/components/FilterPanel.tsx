import { useState } from 'react';
import type { DiscoveryFilters } from '../../../shared/types';

interface FilterPanelProps {
  filters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
  className?: string;
}

const POPULAR_TAGS = [
  'Singleplayer',
  'Multiplayer',
  'Co-op',
  'Story Rich',
  'Indie',
  'Atmospheric',
];

const RELEASE_DATE_OPTIONS = [
  { label: 'Any Time', value: '' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 6 Months', value: '6m' },
  { label: 'Last Year', value: '1y' },
  { label: 'Last 5 Years', value: '5y' },
];

export default function FilterPanel({ filters, onApply, className = '' }: FilterPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [minPrice, setMinPrice] = useState<string>(filters.minPrice?.toString() ?? '');
  const [maxPrice, setMaxPrice] = useState<string>(filters.maxPrice?.toString() ?? '');
  const [minReviewScore, setMinReviewScore] = useState<number>(
    filters.minReviewScore ?? 0,
  );
  const [genres, setGenres] = useState<string>(filters.genres?.join(', ') ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(filters.tags ?? []);
  const [releaseDate, setReleaseDate] = useState<string>('');

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
    'w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--primary)] transition-colors';

  return (
    <div className={`bg-[#242424] border-r border-[#333] overflow-y-auto ${className}`}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center space-x-2">
            <i className="fa-solid fa-filter text-[var(--primary)]" />
            <span>Filters</span>
          </h2>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-white transition-colors"
            title={collapsed ? 'Expand filters' : 'Collapse filters'}
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
        </div>

        {!collapsed && (
          <div className="flex flex-col gap-0">
            {/* Price Range */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">Price Range</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Min Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
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
                  <label className="text-xs text-gray-400 mb-1 block">Max Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
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
              <label className="block text-sm font-semibold mb-3">Minimum Review Score</label>
              <input
                type="range"
                min="0"
                max="100"
                value={minReviewScore}
                onChange={(e) => setMinReviewScore(Number(e.target.value))}
                className="range-slider w-full"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">0%</span>
                <span className="text-sm font-bold text-[var(--primary)]">{minReviewScore}%</span>
                <span className="text-xs text-gray-400">100%</span>
              </div>
            </div>

            {/* Genres */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">Genres</label>
              <textarea
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder="action, rpg, indie, strategy..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400 mt-1">Separate genres with commas</p>
            </div>

            {/* Popular Tags */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">Popular Tags</label>
              <div className="flex flex-wrap gap-2">
                {POPULAR_TAGS.map((tag) => {
                  const isActive = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 bg-[#1a1a1a] border rounded-full text-xs transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] ${
                        isActive
                          ? 'border-[var(--primary)] text-[var(--primary)]'
                          : 'border-[#333]'
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
              <label className="block text-sm font-semibold mb-3">Release Date</label>
              <select
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className={inputClass}
              >
                {RELEASE_DATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleApply}
                className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-[#1a1a1a] font-semibold py-3 rounded-lg transition-opacity"
              >
                Apply Filters
              </button>
              <button
                onClick={handleReset}
                className="px-4 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg transition-colors"
              >
                <i className="fa-solid fa-rotate-right" />
              </button>
            </div>

            {/* Active Filters */}
            <div className="mt-6 pt-6 border-t border-[#333]">
              <div className="text-xs text-gray-400 mb-2">Active Filters</div>
              <div className="text-2xl font-bold text-[var(--primary)]">{activeCount}</div>
            </div>
          </div>
        )}
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
