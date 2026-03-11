import type { Game } from '../../../shared/types';

function formatPrice(cents: number | null): string {
  if (cents === null || cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

function reviewLabel(score: number | null, count: number | null): string {
  if (score === null) return 'No reviews';
  const n = count ?? 0;
  if (score >= 95 && n >= 500) return 'Overwhelmingly Positive';
  if (score >= 80 && n >= 50) return 'Very Positive';
  if (score >= 80) return 'Positive';
  if (score >= 70) return 'Mostly Positive';
  if (score >= 40) return 'Mixed';
  if (score >= 20) return 'Mostly Negative';
  if (n >= 500) return 'Overwhelmingly Negative';
  if (n >= 50) return 'Very Negative';
  return 'Negative';
}

function reviewColor(score: number | null): string {
  if (score === null) return 'var(--muted-foreground)';
  if (score >= 70) return 'oklch(0.72 0.19 142)'; // green
  if (score >= 40) return 'oklch(0.75 0.18 85)'; // yellow/blue like Steam "Mixed"
  return 'oklch(0.65 0.2 25)'; // red
}

interface GameCardProps {
  game: Game;
  className?: string;
}

export default function GameCard({ game, className = '' }: GameCardProps) {
  const steamUrl = `https://store.steampowered.com/app/${game.id}`;

  return (
    <div
      className={`max-w-sm w-full rounded-xl overflow-hidden bg-[var(--card)] text-[var(--card-foreground)] shadow-lg ${className}`}
    >
      {game.headerImage && (
        <img
          src={game.headerImage}
          alt={game.name}
          className="w-full aspect-video object-cover"
        />
      )}

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold leading-tight">{game.name}</h2>
          <a
            href={steamUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="View on Steam"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>

        {/* Reviews */}
        {(game.reviewScore !== null || (game.reviewCount !== null && game.reviewCount > 0)) && (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: reviewColor(game.reviewScore) }}>
                {reviewLabel(game.reviewScore, game.reviewCount)}
              </span>
              {game.reviewCount !== null && game.reviewCount > 0 && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  ({game.reviewCount.toLocaleString()} reviews)
                </span>
              )}
            </div>
            {game.reviewScore !== null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${game.reviewScore}%`,
                      backgroundColor: reviewColor(game.reviewScore),
                    }}
                  />
                </div>
                <span className="text-xs text-[var(--muted-foreground)] w-8 text-right">
                  {game.reviewScore}%
                </span>
              </div>
            )}
          </div>
        )}

        {game.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {game.genres.slice(0, 5).map((genre) => (
              <span
                key={genre}
                className="bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-full px-2 py-0.5 text-xs"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="font-semibold">{formatPrice(game.priceCents)}</span>
          {game.releaseDate && (
            <span className="text-xs text-[var(--muted-foreground)]">
              {game.releaseDate}
            </span>
          )}
        </div>

        {game.shortDesc && (
          <p className="text-sm text-[var(--muted-foreground)] line-clamp-3">
            {game.shortDesc}
          </p>
        )}

        {game.developers.length > 0 && (
          <p className="text-xs text-[var(--muted-foreground)]">
            by {game.developers.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
