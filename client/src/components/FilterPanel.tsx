import { useState } from 'react';
import type { DiscoveryFilters } from '../../../shared/types';

interface FilterPanelProps {
  filters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
}

export default function FilterPanel({ filters, onApply }: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const [minPrice, setMinPrice] = useState<string>(filters.minPrice?.toString() ?? '');
  const [maxPrice, setMaxPrice] = useState<string>(filters.maxPrice?.toString() ?? '');
  const [minReviewScore, setMinReviewScore] = useState<string>(
    filters.minReviewScore?.toString() ?? '',
  );
  const [genres, setGenres] = useState<string>(filters.genres?.join(', ') ?? '');

  const handleApply = () => {
    const next: DiscoveryFilters = {};
    if (minPrice) next.minPrice = Number(minPrice);
    if (maxPrice) next.maxPrice = Number(maxPrice);
    if (minReviewScore) next.minReviewScore = Number(minReviewScore);
    if (genres.trim()) next.genres = genres.split(',').map((g) => g.trim()).filter(Boolean);
    onApply(next);
  };

  const inputClass =
    'w-full px-3 py-1.5 rounded-md text-sm bg-[var(--input)] border border-[var(--border)] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]';

  return (
    <div className="w-full max-w-sm">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1 mb-2"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Filters
      </button>

      {open && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3 mb-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                Min Price (cents)
              </label>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                Max Price (cents)
              </label>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="6999"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
              Min Review Score (%)
            </label>
            <input
              type="number"
              value={minReviewScore}
              onChange={(e) => setMinReviewScore(e.target.value)}
              placeholder="0"
              min="0"
              max="100"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
              Genres (comma-separated)
            </label>
            <input
              type="text"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
              placeholder="action, rpg, indie"
              className={inputClass}
            />
          </div>

          <button
            onClick={handleApply}
            className="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-1.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Apply Filters
          </button>
        </div>
      )}
    </div>
  );
}
