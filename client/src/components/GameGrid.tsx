import type { Recommendation } from '../../../shared/types';
import BookmarkButton from './BookmarkButton';

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {games.map((rec) => (
        <div
          key={rec.id}
          className="bg-[#242424] border border-[#333] rounded-xl overflow-hidden hover:border-[var(--primary)] transition-all group cursor-pointer flex flex-col"
        >
          {/* Image section */}
          <div className="relative h-48 overflow-hidden">
            {rec.game.headerImage && (
              <img
                src={rec.game.headerImage}
                alt={rec.game.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            )}
            <span
              className="absolute top-3 right-3 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold"
              style={{
                backgroundColor: `color-mix(in srgb, ${scoreColor(rec.score)} 90%, transparent)`,
                color: '#fff',
              }}
            >
              {Math.round(rec.score * 100)}% Match
            </span>
          </div>

          {/* Content */}
          <div className="p-5 flex flex-col gap-3 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xl font-bold mb-2 leading-tight">{rec.game.name}</h3>
              <div className="flex items-center gap-1 shrink-0">
                <BookmarkButton gameId={rec.game.id} size={14} />
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(rec.id)}
                    className="p-1.5 rounded hover:bg-[#1a1a1a] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    title="Dismiss"
                  >
                    <i className="fa-solid fa-xmark text-xs" />
                  </button>
                )}
              </div>
            </div>

            {rec.game.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rec.game.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-[#1a1a1a] text-xs font-medium rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Why This Game button */}
            {onExplain && (
              <button
                onClick={() => onExplain(rec.id)}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-[#1a1a1a] hover:bg-[var(--primary)] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all mt-auto"
              >
                <i className="fa-solid fa-lightbulb" />
                <span>Why This Game?</span>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
