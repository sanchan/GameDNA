import type { Recommendation } from '../../../shared/types';
import BookmarkButton from './BookmarkButton';

function formatPrice(cents: number | null): string | null {
  if (cents === null || cents === 0) return cents === 0 ? 'Free' : null;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatReviewCount(count: number | null): string | null {
  if (count === null) return null;
  if (count >= 1000) return `${Math.round(count / 1000)}K reviews`;
  return `${count} reviews`;
}

function extractYear(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const match = releaseDate.match(/\d{4}/);
  return match ? match[0] : null;
}

interface GameGridProps {
  games: Recommendation[];
  onExplain?: (id: number) => void;
  onDismiss?: (id: number) => void;
}

export default function GameGrid({ games, onExplain, onDismiss }: GameGridProps) {
  if (games.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {games.map((rec) => {
        const price = formatPrice(rec.game.priceCents);
        const year = extractYear(rec.game.releaseDate);
        const developer = rec.game.developers?.[0];
        const reviewCount = formatReviewCount(rec.game.reviewCount);
        const reviewScore = rec.game.reviewScore;

        return (
          <div
            key={rec.id}
            className="bg-[#242424] border border-[#333] rounded-2xl overflow-hidden hover:border-[var(--primary)] transition-all duration-300 group cursor-pointer flex flex-col"
          >
            {/* Image section */}
            <div className="relative h-64 overflow-hidden">
              {rec.game.headerImage && (
                <img
                  src={rec.game.headerImage}
                  alt={rec.game.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#242424] via-transparent to-transparent" />

              {/* Match score badge */}
              <div className="absolute top-4 right-4 bg-[var(--primary)] text-[#1a1a1a] px-3 py-1.5 rounded-full font-bold text-sm flex items-center space-x-1.5">
                <i className="fa-solid fa-star" />
                <span>{Math.round(rec.score * 100)}%</span>
              </div>

              {/* Action buttons */}
              <div className="absolute top-4 left-4 flex items-center space-x-2">
                <BookmarkButton
                  gameId={rec.game.id}
                  size={14}
                  className="w-9 h-9 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[var(--primary)] rounded-full flex items-center justify-center transition-all"
                />
                <button className="w-9 h-9 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-red-500 rounded-full flex items-center justify-center transition-all">
                  <i className="fa-regular fa-heart" />
                </button>
                {rec.game.id && (
                  <a
                    href={`https://store.steampowered.com/app/${rec.game.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-blue-500 rounded-full flex items-center justify-center transition-all"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <i className="fa-brands fa-steam" />
                  </a>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col gap-0 flex-1">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold mb-1 leading-tight">{rec.game.name}</h3>
                  {(developer || year) && (
                    <div className="flex items-center space-x-2 text-sm text-[var(--muted-foreground)]">
                      {developer && <span>{developer}</span>}
                      {developer && year && <span>•</span>}
                      {year && <span>{year}</span>}
                    </div>
                  )}
                </div>
                {price && (
                  <div className="text-xl font-bold text-[var(--primary)] ml-4">{price}</div>
                )}
              </div>

              {/* Review score */}
              {(reviewScore !== null || reviewCount) && (
                <div className="flex items-center space-x-3 mb-4">
                  {reviewScore !== null && (
                    <div className="flex items-center space-x-1 bg-green-500/20 text-green-500 px-2.5 py-1 rounded-full text-xs font-semibold">
                      <i className="fa-solid fa-thumbs-up" />
                      <span>{reviewScore}%</span>
                    </div>
                  )}
                  {reviewCount && (
                    <div className="text-xs text-[var(--muted-foreground)]">
                      <i className="fa-solid fa-users" /> {reviewCount}
                    </div>
                  )}
                </div>
              )}

              {/* Tags */}
              {rec.game.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {rec.game.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="bg-[#1a1a1a] px-2.5 py-1 rounded-full text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {rec.game.shortDesc && (
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mb-4 line-clamp-2">
                  {rec.game.shortDesc}
                </p>
              )}

              {/* Why This Game link */}
              {onExplain && (
                <button
                  onClick={() => onExplain(rec.id)}
                  className="text-[var(--primary)] hover:opacity-80 text-sm font-semibold flex items-center space-x-1.5 mt-auto"
                >
                  <span>Why this game?</span>
                  <i className="fa-solid fa-arrow-right text-xs" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
