import type { Recommendation, Game } from '../../../shared/types';

function formatPrice(cents: number | null): string {
  if (cents === null || cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'oklch(0.72 0.19 142)';
  if (score >= 0.4) return 'oklch(0.75 0.18 85)';
  return 'var(--muted-foreground)';
}

interface GameGridProps {
  games: Recommendation[];
  onExplain?: (id: number) => void;
  onDismiss?: (id: number) => void;
}

export default function GameGrid({ games, onExplain, onDismiss }: GameGridProps) {
  if (games.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {games.map((rec) => (
        <div
          key={rec.id}
          className="rounded-xl overflow-hidden bg-[var(--card)] text-[var(--card-foreground)] shadow-lg flex flex-col"
        >
          {rec.game.headerImage && (
            <img
              src={rec.game.headerImage}
              alt={rec.game.name}
              className="w-full aspect-video object-cover"
            />
          )}

          <div className="p-4 flex flex-col gap-2.5 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold leading-tight">{rec.game.name}</h3>
              <span
                className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  color: scoreColor(rec.score),
                  border: `1px solid ${scoreColor(rec.score)}`,
                }}
              >
                {Math.round(rec.score * 100)}%
              </span>
            </div>

            {rec.game.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {rec.game.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-full px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {rec.aiExplanation && (
              <p className="text-sm text-[var(--muted-foreground)] line-clamp-2">
                {rec.aiExplanation}
              </p>
            )}

            <div className="flex items-center justify-between mt-auto pt-2">
              <span className="text-sm font-medium">{formatPrice(rec.game.priceCents)}</span>
              <div className="flex items-center gap-2">
                {onExplain && (
                  <button
                    onClick={() => onExplain(rec.id)}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Why this?
                  </button>
                )}
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(rec.id)}
                    className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
