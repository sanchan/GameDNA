import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import type { Game, SwipeDecision } from '../../../shared/types';
import BookmarkButton from '../components/BookmarkButton';

function formatPrice(cents: number | null): string {
  if (cents === null || cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

function reviewColor(score: number | null): string {
  if (score === null) return 'var(--muted-foreground)';
  if (score > 70) return 'oklch(0.72 0.19 142)';
  if (score >= 40) return 'oklch(0.75 0.18 85)';
  return 'var(--destructive-foreground)';
}

function reviewLabel(score: number | null): string {
  if (score === null) return 'No reviews';
  if (score >= 95) return 'Overwhelmingly Positive';
  if (score >= 80) return 'Very Positive';
  if (score >= 70) return 'Mostly Positive';
  if (score >= 40) return 'Mixed';
  if (score >= 20) return 'Mostly Negative';
  return 'Overwhelmingly Negative';
}

// The games API returns raw DB rows (snake_case), so we need to handle both formats
function normalizeGame(raw: any): Game {
  if (raw.headerImage !== undefined || raw.shortDesc !== undefined) {
    return raw as Game;
  }
  return {
    id: raw.id,
    name: raw.name,
    shortDesc: raw.short_desc ?? null,
    headerImage: raw.header_image ?? null,
    genres: raw.genres ? (typeof raw.genres === 'string' ? JSON.parse(raw.genres) : raw.genres) : [],
    tags: raw.tags ? (typeof raw.tags === 'string' ? JSON.parse(raw.tags) : raw.tags) : [],
    releaseDate: raw.release_date ?? null,
    priceCents: raw.price_cents ?? null,
    reviewScore: raw.review_score ?? null,
    reviewCount: raw.review_count ?? null,
    developers: raw.developers ? (typeof raw.developers === 'string' ? JSON.parse(raw.developers) : raw.developers) : [],
    publishers: raw.publishers ? (typeof raw.publishers === 'string' ? JSON.parse(raw.publishers) : raw.publishers) : [],
    platforms: raw.platforms ? (typeof raw.platforms === 'string' ? JSON.parse(raw.platforms) : raw.platforms) : { windows: false, mac: false, linux: false },
  };
}

export default function GameDetail() {
  const { appid } = useParams<{ appid: string }>();
  const { user } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<SwipeDecision | null>(null);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    if (!appid) return;
    setLoading(true);
    setError(null);
    api.get<any>(`/games/${appid}`)
      .then((raw) => setGame(normalizeGame(raw)))
      .catch((err) => setError(err.message || 'Failed to load game'))
      .finally(() => setLoading(false));
  }, [appid]);

  const handleSwipe = async (decision: SwipeDecision) => {
    if (!game || swiping) return;
    setSwiping(true);
    try {
      await api.post('/discovery/swipe', { gameId: game.id, decision });
      setSwiped(decision);
    } catch {
      // ignore
    } finally {
      setSwiping(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="w-full aspect-video bg-[var(--muted)] rounded-xl animate-pulse mb-6" />
        <div className="h-8 w-1/2 bg-[var(--muted)] rounded animate-pulse mb-4" />
        <div className="h-4 w-full bg-[var(--muted)] rounded animate-pulse mb-2" />
        <div className="h-4 w-3/4 bg-[var(--muted)] rounded animate-pulse" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-lg text-[var(--muted-foreground)]">{error || 'Game not found'}</p>
        <Link to="/" className="text-[var(--primary)] text-sm mt-2 inline-block hover:underline">
          Go back
        </Link>
      </div>
    );
  }

  const description = game.shortDesc;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {game.headerImage && (
        <img
          src={game.headerImage}
          alt={game.name}
          className="w-full rounded-xl mb-6 shadow-lg"
        />
      )}

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">{game.name}</h1>
        <div className="flex items-center gap-0.5 shrink-0">
          <BookmarkButton gameId={game.id} size={20} />
          <a
            href={`steam://addtowishlist/${game.id}`}
            className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[oklch(0.72_0.19_142)]"
            title="Add to Steam Wishlist"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </a>
          <a
            href={`https://store.steampowered.com/app/${game.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="View on Steam"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-xl font-semibold text-[var(--foreground)]">
          {formatPrice(game.priceCents)}
        </span>
        <span style={{ color: reviewColor(game.reviewScore) }} className="text-sm font-medium">
          {reviewLabel(game.reviewScore)}
          {game.reviewScore !== null && ` (${game.reviewScore}%)`}
          {game.reviewCount !== null && (
            <span className="text-[var(--muted-foreground)] ml-1">
              - {game.reviewCount.toLocaleString()} reviews
            </span>
          )}
        </span>
      </div>

      {description && (
        <p className="text-[var(--muted-foreground)] mb-6 leading-relaxed">{description}</p>
      )}

      {game.genres.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Genres</h3>
          <div className="flex flex-wrap gap-1.5">
            {game.genres.map((genre) => (
              <span
                key={genre}
                className="bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-full px-3 py-1 text-sm"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>
      )}

      {game.tags.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {game.tags.slice(0, 12).map((tag) => (
              <span
                key={tag}
                className="bg-[var(--muted)] text-[var(--muted-foreground)] rounded-full px-2.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-6 mb-6">
        {game.developers.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Developers</h3>
            <p className="text-sm text-[var(--foreground)]">{game.developers.join(', ')}</p>
          </div>
        )}
        {game.publishers.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Publishers</h3>
            <p className="text-sm text-[var(--foreground)]">{game.publishers.join(', ')}</p>
          </div>
        )}
        {game.releaseDate && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Release Date</h3>
            <p className="text-sm text-[var(--foreground)]">{game.releaseDate}</p>
          </div>
        )}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Platforms</h3>
          <p className="text-sm text-[var(--foreground)]">
            {[
              game.platforms.windows && 'Win',
              game.platforms.mac && 'Mac',
              game.platforms.linux && 'Linux',
            ]
              .filter(Boolean)
              .join(' / ') || 'Unknown'}
          </p>
        </div>
      </div>

      {user && !swiped && (
        <div className="flex items-center gap-4 pt-4 border-t border-[var(--border)]">
          <span className="text-sm text-[var(--muted-foreground)]">Interested?</span>
          <button
            onClick={() => handleSwipe('no')}
            disabled={swiping}
            className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
          >
            Not for me
          </button>
          <button
            onClick={() => handleSwipe('maybe')}
            disabled={swiping}
            className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--border)] hover:bg-[var(--muted)] disabled:opacity-50"
            style={{ color: 'oklch(0.75 0.18 85)', borderColor: 'oklch(0.75 0.18 85)' }}
          >
            Maybe
          </button>
          <button
            onClick={() => handleSwipe('yes')}
            disabled={swiping}
            className="px-4 py-2 rounded-md text-sm font-medium border hover:opacity-90 disabled:opacity-50"
            style={{ color: 'oklch(0.72 0.19 142)', borderColor: 'oklch(0.72 0.19 142)' }}
          >
            Interested
          </button>
        </div>
      )}

      {swiped && (
        <div className="pt-4 border-t border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">
            You marked this as <span className="font-semibold text-[var(--foreground)]">{swiped}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
