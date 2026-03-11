import type { Game } from '../../../shared/types';

function formatPrice(cents: number | null): string {
  if (cents === null || cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

function reviewColor(score: number | null): string {
  if (score === null) return 'var(--muted-foreground)';
  if (score > 70) return 'oklch(0.72 0.19 142)'; // green
  if (score >= 40) return 'oklch(0.75 0.18 85)'; // yellow
  return 'var(--destructive-foreground)'; // red
}

interface GameCardProps {
  game: Game;
  className?: string;
}

export default function GameCard({ game, className = '' }: GameCardProps) {
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
        <h2 className="text-xl font-bold leading-tight">{game.name}</h2>

        {game.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {game.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-full px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="font-semibold">{formatPrice(game.priceCents)}</span>
          <span style={{ color: reviewColor(game.reviewScore) }}>
            {game.reviewScore !== null ? `${game.reviewScore}%` : 'No reviews'}
            {game.reviewCount !== null && (
              <span className="text-xs text-[var(--muted-foreground)] ml-1">
                ({game.reviewCount.toLocaleString()})
              </span>
            )}
          </span>
        </div>

        {game.shortDesc && (
          <p className="text-sm text-[var(--muted-foreground)] line-clamp-3">
            {game.shortDesc}
          </p>
        )}
      </div>
    </div>
  );
}
