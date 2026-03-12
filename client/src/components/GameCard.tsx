import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../../shared/types';
import BookmarkButton from './BookmarkButton';
import MediaGallery from './MediaGallery';
import i18n from '../i18n';

function formatPrice(cents: number | null, currency?: string | null): string | null {
  if (cents === null || cents === 0) return cents === 0 ? i18n.t('common.free') : null;
  const amount = cents / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch { /* fall through */ }
  }
  return `$${amount.toFixed(2)}`;
}

function formatReviewCount(count: number | null): string | null {
  if (count === null) return null;
  if (count >= 1000) return i18n.t('gameCard.reviewsK', { count: Math.round(count / 1000) });
  return i18n.t('gameCard.reviews', { count });
}

function extractYear(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const match = releaseDate.match(/\d{4}/);
  return match ? match[0] : null;
}

export interface MediaItem {
  type: 'image' | 'video';
  thumbnail: string;
  full: string;
  videoSrc?: string;
}

interface GameCardProps {
  game: Game;
  score?: number | null;
  className?: string;
}

export default function GameCard({ game, score, className = '' }: GameCardProps) {
  const { t } = useTranslation();
  const [mediaItems, setMediaItems] = useState<MediaItem[] | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const price = formatPrice(game.priceCents, game.priceCurrency);
  const year = extractYear(game.releaseDate);
  const developer = game.developers?.[0];
  const reviewCount = formatReviewCount(game.reviewCount);
  const reviewScore = game.reviewScore;

  const loadMedia = useCallback(async () => {
    if (mediaItems !== null || mediaLoading) return mediaItems;
    setMediaLoading(true);
    // Media data is not stored locally; return empty (no server API available)
    setMediaItems([]);
    setMediaLoading(false);
    return [];
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

  const showHeader = currentIndex === 0;
  const currentMedia = !showHeader && mediaItems ? mediaItems[currentIndex - 1] : null;
  const totalSlides = mediaItems ? mediaItems.length + 1 : null;
  const galleryIndex = currentIndex > 0 ? currentIndex - 1 : 0;

  return (
    <div className={`bg-[#242424] border border-[#333] rounded-2xl overflow-hidden hover:border-[var(--primary)] transition-all duration-300 group flex flex-col ${className}`}>
      {/* Image / Gallery section */}
      <div className="relative h-64 overflow-hidden bg-[#1a1a1a]">
        <div className="w-full h-full cursor-pointer" onClick={handleFullscreen}>
          {showHeader ? (
            game.headerImage && (
              <img
                src={game.headerImage}
                alt={game.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
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
              onClick={(e) => e.stopPropagation()}
            />
          ) : currentMedia ? (
            <img
              src={currentMedia.full}
              alt={game.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : null}
        </div>

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
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center space-x-1 z-20">
            {Array.from({ length: Math.min(totalSlides, 20) }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentIndex ? 'bg-[var(--primary)]' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        )}

        {/* Navigation arrows */}
        <button
          onClick={handlePrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all opacity-0 group-hover:opacity-100"
        >
          <i className="fa-solid fa-chevron-left text-xs" />
        </button>
        <button
          onClick={handleNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all opacity-0 group-hover:opacity-100"
        >
          <i className="fa-solid fa-chevron-right text-xs" />
        </button>

        {/* Match score badge — top right */}
        {score != null && score > 0 && (
          <div className="absolute top-4 right-4 bg-[var(--primary)] text-[var(--primary-foreground)] px-3 py-1.5 rounded-full font-bold text-sm flex items-center space-x-1.5 z-20">
            <i className="fa-solid fa-star" />
            <span>{t('common.match', { score: Math.round(score) })}</span>
          </div>
        )}

        {/* Action buttons — top left */}
        <div className="absolute top-4 left-4 flex items-center space-x-2 z-20">
          <BookmarkButton
            gameId={game.id}
            size={14}
            className="w-9 h-9 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[var(--primary)] rounded-full flex items-center justify-center transition-all"
          />
          <a
            href={`steam://addtowishlist/${game.id}`}
            onClick={(e) => e.stopPropagation()}
            className="w-9 h-9 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
            title={t('gameCard.addToSteamWishlist')}
          >
            <i className="fa-regular fa-heart text-white/70" />
          </a>
          <a
            href={`https://store.steampowered.com/app/${game.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-blue-500 rounded-full flex items-center justify-center transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <i className="fa-brands fa-steam text-white/70" />
          </a>
        </div>

        {/* Price badge — bottom right of image */}
        {price && (
          <div className="absolute bottom-4 right-4 z-20 bg-[#1a1a1a]/90 backdrop-blur-sm px-3 py-1.5 rounded-lg">
            <span className="text-lg font-bold text-[var(--primary)]">{price}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col gap-0 flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <Link to={`/game/${game.id}`} className="hover:text-[var(--primary)] transition-colors">
              <h3 className="text-xl font-bold mb-1 leading-tight">{game.name}</h3>
            </Link>
            {(developer || year) && (
              <div className="flex items-center space-x-2 text-sm text-[var(--muted-foreground)]">
                {developer && <span>{developer}</span>}
                {developer && year && <span>&bull;</span>}
                {year && <span>{year}</span>}
              </div>
            )}
          </div>
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
        {game.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {game.tags.slice(0, 3).map((tag) => (
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
        {game.shortDesc && (
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed line-clamp-2">
            {game.shortDesc}
          </p>
        )}
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
