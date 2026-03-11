import { useState, useCallback } from 'react';
import type { Game } from '../../../shared/types';
import BookmarkButton from './BookmarkButton';
import { api } from '../lib/api';

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
  if (score >= 70) return 'oklch(0.72 0.19 142)';
  if (score >= 40) return 'oklch(0.75 0.18 85)';
  return 'oklch(0.65 0.2 25)';
}

interface MediaItem {
  type: 'image' | 'video';
  thumbnail: string;
  full: string;
  videoSrc?: string;
}

interface MediaResponse {
  screenshots: Array<{ id: number; thumbnail: string; full: string }>;
  movies: Array<{
    id: number;
    name: string;
    thumbnail: string;
    webm480: string | null;
    webmMax: string | null;
    mp4480: string | null;
    mp4Max: string | null;
  }>;
}

interface GameCardProps {
  game: Game;
  className?: string;
}

export default function GameCard({ game, className = '' }: GameCardProps) {
  const steamUrl = `https://store.steampowered.com/app/${game.id}`;

  // Carousel state — index 0 = header image (always available)
  const [mediaItems, setMediaItems] = useState<MediaItem[] | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const loadMedia = useCallback(async () => {
    if (mediaItems !== null || mediaLoading) return mediaItems;
    setMediaLoading(true);
    try {
      const data = await api.get<MediaResponse>(`/games/${game.id}/media`);
      const items: MediaItem[] = [];

      // Videos first, then screenshots
      for (const m of data.movies) {
        items.push({
          type: 'video',
          thumbnail: m.thumbnail,
          full: m.thumbnail,
          videoSrc: m.mp4480 || m.webm480 || m.mp4Max || m.webmMax || undefined,
        });
      }
      for (const s of data.screenshots) {
        items.push({
          type: 'image',
          thumbnail: s.thumbnail,
          full: s.full,
        });
      }

      setMediaItems(items);
      setMediaLoading(false);
      return items;
    } catch {
      setMediaItems([]);
      setMediaLoading(false);
      return [];
    }
  }, [game.id, mediaItems, mediaLoading]);

  const handlePrev = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const items = mediaItems ?? (await loadMedia());
    if (!items || items.length === 0) return;
    const total = items.length + 1; // +1 for header
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const items = mediaItems ?? (await loadMedia());
    if (!items || items.length === 0) return;
    const total = items.length + 1;
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  // Determine what to show
  const showHeader = currentIndex === 0;
  const currentMedia = !showHeader && mediaItems ? mediaItems[currentIndex - 1] : null;
  const totalSlides = mediaItems ? mediaItems.length + 1 : null;

  return (
    <div
      className={`max-w-sm w-full rounded-xl overflow-hidden bg-[var(--card)] text-[var(--card-foreground)] shadow-lg ${className}`}
    >
      {/* Image/Video carousel area */}
      <div className="relative w-full aspect-video bg-[var(--muted)] group">
        {showHeader ? (
          game.headerImage && (
            <img
              src={game.headerImage}
              alt={game.name}
              className="w-full h-full object-cover"
            />
          )
        ) : currentMedia?.type === 'video' && currentMedia.videoSrc ? (
          <video
            src={currentMedia.videoSrc}
            poster={currentMedia.thumbnail}
            controls
            autoPlay
            muted
            className="w-full h-full object-cover"
          />
        ) : currentMedia ? (
          <img
            src={currentMedia.full}
            alt={game.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : null}

        {/* Loading overlay */}
        {mediaLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          </div>
        )}

        {/* Nav arrows — always visible on hover */}
        <button
          onClick={handlePrev}
          className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          title="Previous"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={handleNext}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          title="Next"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Slide indicator */}
        {totalSlides !== null && totalSlides > 1 && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {currentMedia?.type === 'video' ? (
              <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                Video {currentIndex} / {totalSlides - 1}
              </span>
            ) : (
              <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                {currentIndex + 1} / {totalSlides}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold leading-tight">{game.name}</h2>
          <div className="flex items-center gap-0.5 shrink-0">
            <BookmarkButton gameId={game.id} size={18} />
            <a
              href={`steam://addtowishlist/${game.id}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[oklch(0.72_0.19_142)]"
              title="Add to Steam Wishlist"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </a>
            <a
              href={steamUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              title="View on Steam"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
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
