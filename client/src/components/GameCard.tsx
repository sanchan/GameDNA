import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Game, SwipeDecision } from '../../../shared/types';
import BookmarkButton from './BookmarkButton';
import MediaGallery from './MediaGallery';
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

function reviewBadgeClasses(score: number | null): string {
  if (score === null) return 'bg-gray-500/20 text-gray-400';
  if (score >= 70) return 'bg-green-500/20 text-green-500';
  if (score >= 40) return 'bg-yellow-500/20 text-yellow-500';
  return 'bg-red-500/20 text-red-500';
}

function formatReviewCount(count: number): string {
  if (count >= 1000) return `${Math.round(count / 1000)}K reviews`;
  return `${count.toLocaleString()} reviews`;
}

export interface MediaItem {
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
    mp4480: string | null;
    mp4Max: string | null;
  }>;
}

interface GameCardProps {
  game: Game;
  score?: number | null;
  className?: string;
  onSwipe?: (decision: SwipeDecision) => void;
  onInfo?: () => void;
}

export default function GameCard({ game, score, className = '', onSwipe, onInfo }: GameCardProps) {
  const steamUrl = `https://store.steampowered.com/app/${game.id}`;

  // Carousel state — index 0 = header image (always available)
  const [mediaItems, setMediaItems] = useState<MediaItem[] | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const loadMedia = useCallback(async () => {
    if (mediaItems !== null || mediaLoading) return mediaItems;
    setMediaLoading(true);
    try {
      const data = await api.get<MediaResponse>(`/games/${game.id}/media`);
      const items: MediaItem[] = [];

      for (const m of data.movies) {
        items.push({
          type: 'video',
          thumbnail: m.thumbnail,
          full: m.thumbnail,
          videoSrc: m.mp4480 || m.mp4Max || undefined,
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
    const total = items.length + 1;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const items = mediaItems ?? (await loadMedia());
    if (!items || items.length === 0) return;
    const total = items.length + 1;
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  const handleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const items = mediaItems ?? (await loadMedia());
    if (!items || items.length === 0) return;
    setGalleryOpen(true);
  };

  // Determine what to show
  const showHeader = currentIndex === 0;
  const currentMedia = !showHeader && mediaItems ? mediaItems[currentIndex - 1] : null;
  const totalSlides = mediaItems ? mediaItems.length + 1 : null;

  // Gallery index maps: card index 0 = header (not in gallery), 1+ = mediaItems[i-1]
  const galleryIndex = currentIndex > 0 ? currentIndex - 1 : 0;

  // Extract year from release date
  const releaseYear = game.releaseDate
    ? new Date(game.releaseDate).getFullYear() || game.releaseDate
    : null;

  return (
    <div
      className={`absolute inset-0 bg-[#242424] border border-[#333] rounded-3xl overflow-hidden shadow-2xl ${className}`}
    >
      <div className="relative h-full flex flex-col">
        {/* Media section */}
        <div id="card-media-section" className="relative h-[360px] bg-[#1a1a1a] group">
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

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#242424] via-transparent to-transparent pointer-events-none" />

          {/* Loading overlay */}
          {mediaLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            </div>
          )}

          {/* Slide indicator dots */}
          {totalSlides !== null && totalSlides > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center space-x-1 z-20">
              {Array.from({ length: Math.min(totalSlides, 20) }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentIndex ? 'bg-[var(--primary)]' : 'bg-[#333]'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Navigation arrows — centered vertically on sides */}
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center text-white transition-all"
            title="Previous"
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center text-white transition-all"
            title="Next"
          >
            <i className="fa-solid fa-chevron-right" />
          </button>

          {/* Top-right action row */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={handleFullscreen}
              className="w-8 h-8 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all"
              title="Fullscreen gallery"
            >
              <i className="fa-solid fa-expand text-xs" />
            </button>
            <BookmarkButton gameId={game.id} size={16} />
            <a
              href={`steam://addtowishlist/${game.id}`}
              onClick={(e) => e.stopPropagation()}
              className="w-8 h-8 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center text-white/70 hover:text-[oklch(0.72_0.19_142)] transition-all"
              title="Add to Steam Wishlist"
            >
              <i className="fa-solid fa-heart text-xs" />
            </a>
            <a
              href={steamUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-8 h-8 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all"
              title="View on Steam"
            >
              <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
            </a>
          </div>

          {/* Match badge */}
          {score != null && score > 0 && (
            <div className="absolute top-16 right-4 bg-[var(--primary)] text-[#1a1a1a] px-4 py-2 rounded-full font-bold text-sm z-20">
              <i className="fa-solid fa-star mr-1" />
              {Math.round(score)}% Match
            </div>
          )}

          {/* Price badge — bottom right of image */}
          <div className="absolute bottom-4 right-4 z-20 bg-[#1a1a1a]/90 backdrop-blur-sm px-3 py-1.5 rounded-lg">
            <span className="text-lg font-bold text-[var(--primary)]">{formatPrice(game.priceCents)}</span>
          </div>
        </div>

        {/* Content section */}
        <div id="card-content-section" className="flex-1 p-6 flex flex-col">
          {/* Title + Info */}
          <div className="flex items-start gap-2 mb-1">
            <h2 className="text-2xl font-bold leading-tight">{game.name}</h2>
            {onInfo && (
              <button
                onClick={(e) => { e.stopPropagation(); onInfo(); }}
                className="flex-shrink-0 w-7 h-7 bg-blue-500/20 hover:bg-blue-500 rounded-full flex items-center justify-center text-blue-400 hover:text-white transition-all mt-1"
                title="More info"
              >
                <i className="fa-solid fa-info text-xs" />
              </button>
            )}
          </div>

          {/* Developer / Year */}
          {(game.developers.length > 0 || releaseYear) && (
            <div className="flex items-center space-x-3 text-sm text-gray-400 mb-3">
              {game.developers.length > 0 && <span>{game.developers.join(', ')}</span>}
              {game.developers.length > 0 && releaseYear && <span>&bull;</span>}
              {releaseYear && <span>{releaseYear}</span>}
            </div>
          )}

          {/* Review bar */}
          {game.reviewScore !== null && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold" style={{ color: reviewColor(game.reviewScore) }}>
                  {reviewLabel(game.reviewScore, game.reviewCount)}
                </span>
                <span className="text-sm font-bold" style={{ color: reviewColor(game.reviewScore) }}>
                  {game.reviewScore}%
                </span>
              </div>
              <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${game.reviewScore}%`, backgroundColor: reviewColor(game.reviewScore) }}
                />
              </div>
              {game.reviewCount !== null && game.reviewCount > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  {formatReviewCount(game.reviewCount)}
                </div>
              )}
            </div>
          )}

          {/* Genre pills */}
          {game.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {game.genres.slice(0, 5).map((genre) => (
                <span
                  key={genre}
                  className="bg-[#1a1a1a] px-3 py-1 rounded-full text-xs font-medium"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {game.shortDesc && (
            <p className="text-sm text-gray-400 leading-relaxed mb-6 line-clamp-3">
              {game.shortDesc}
            </p>
          )}

          {/* Swipe buttons */}
          {onSwipe && (
            <div className="mt-auto flex items-center justify-center space-x-4">
              <button
                onClick={() => onSwipe('no')}
                className="group w-16 h-16 bg-red-500/20 hover:bg-red-500 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                title="Not interested"
              >
                <i className="fa-solid fa-thumbs-down text-2xl text-red-500 group-hover:text-white transition-colors" />
              </button>
              <button
                onClick={() => onSwipe('maybe')}
                className="group w-16 h-16 bg-gray-500/20 hover:bg-gray-500 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                title="Maybe later"
              >
                <i className="fa-solid fa-minus text-2xl text-gray-400 group-hover:text-white transition-colors" />
              </button>
              <button
                onClick={() => onSwipe('yes')}
                className="group w-16 h-16 bg-green-500/20 hover:bg-green-500 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                title="Interested!"
              >
                <i className="fa-solid fa-thumbs-up text-2xl text-green-500 group-hover:text-white transition-colors" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen gallery portal */}
      {galleryOpen && mediaItems && mediaItems.length > 0 && createPortal(
        <MediaGallery
          items={mediaItems}
          initialIndex={galleryIndex}
          onClose={() => setGalleryOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}
