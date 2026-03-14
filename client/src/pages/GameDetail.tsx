import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import { useBookmarks } from '../hooks/use-bookmarks';
import { useToast } from '../components/Toast';
import { cacheGame } from '../services/game-cache';
import MediaGallery from '../components/MediaGallery';
import { Select } from '../components/Select';
import type { Game, SwipeDecision, GameStatusType, GameNote, Collection } from '../../../shared/types';

interface MediaItem {
  type: 'image' | 'video';
  thumbnail: string;
  full: string;
  videoSrc?: string;
}

function formatPrice(cents: number | null, currency?: string | null): string {
  if (cents === null || cents === 0) return i18n.t('common.freeToPlay');
  const amount = cents / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch { /* fall through */ }
  }
  return `$${amount.toFixed(2)}`;
}

function reviewColor(score: number | null): string {
  if (score === null) return 'var(--muted-foreground)';
  if (score > 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function reviewBgColor(score: number | null): string {
  if (score === null) return 'rgba(255,255,255,0.1)';
  if (score > 70) return 'rgba(34,197,94,0.2)';
  if (score >= 40) return 'rgba(234,179,8,0.2)';
  return 'rgba(239,68,68,0.2)';
}

function reviewLabel(score: number | null): string {
  if (score === null) return i18n.t('gameDetail.reviewLabels.noReviews');
  if (score >= 95) return i18n.t('gameDetail.reviewLabels.overwhelminglyPositive');
  if (score >= 80) return i18n.t('gameDetail.reviewLabels.veryPositive');
  if (score >= 70) return i18n.t('gameDetail.reviewLabels.mostlyPositive');
  if (score >= 40) return i18n.t('gameDetail.reviewLabels.mixed');
  if (score >= 20) return i18n.t('gameDetail.reviewLabels.mostlyNegative');
  return i18n.t('gameDetail.reviewLabels.overwhelminglyNegative');
}

function getReleaseYear(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const match = releaseDate.match(/(\d{4})/);
  return match ? match[1] : null;
}

export default function GameDetail() {
  const { t } = useTranslation();
  const { appid } = useParams<{ appid: string }>();
  const { user } = useAuth();
  const { userId } = useDb();
  const { isBookmarked, toggle: toggleBookmark } = useBookmarks();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<SwipeDecision | null>(null);
  const [swiping, setSwiping] = useState(false);
  const { toast } = useToast();

  // Similar games
  const [similarGames, setSimilarGames] = useState<{ game: Game; similarity: number }[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Personal notes
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteLoaded, setNoteLoaded] = useState(false);

  // Game status
  const [gameStatus, setGameStatus] = useState<GameStatusType | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);

  // AI review summary
  const [reviewSummary, setReviewSummary] = useState<string | null>(null);
  const [loadingReviewSummary, setLoadingReviewSummary] = useState(false);

  // Sync game data
  const [syncing, setSyncing] = useState(false);

  // Collections
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCollections, setShowCollections] = useState(false);

  // Media state
  const [mediaItems, setMediaItems] = useState<MediaItem[] | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Escape key navigates back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !galleryOpen) {
        e.preventDefault();
        navigate(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, galleryOpen]);

  useEffect(() => {
    if (!appid) return;
    setLoading(true);
    setError(null);
    try {
      const g = queries.getGame(Number(appid));
      if (g) {
        setGame(g);
      } else {
        setError('Game not found in local database');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [appid]);

  const loadMedia = useCallback(() => {
    if (mediaItems !== null || mediaLoading || !game) return mediaItems;
    setMediaLoading(true);
    const items: MediaItem[] = [];
    // Add movies first
    for (const m of game.movies ?? []) {
      items.push({
        type: 'video',
        thumbnail: m.thumbnail,
        full: m.thumbnail,
        videoSrc: m.webmMax || m.webm480,
      });
    }
    // Then screenshots
    for (const s of game.screenshots ?? []) {
      items.push({
        type: 'image',
        thumbnail: s.thumbnail,
        full: s.full,
      });
    }
    setMediaItems(items);
    setMediaLoading(false);
    return items;
  }, [game, mediaItems, mediaLoading]);

  // Load media on mount
  useEffect(() => {
    if (game && !mediaItems && !mediaLoading) {
      loadMedia();
    }
  }, [game, mediaItems, mediaLoading, loadMedia]);

  // Load similar games
  useEffect(() => {
    if (!game || !user || !userId) return;
    setLoadingSimilar(true);
    try {
      const similar = queries.getSimilarGames(game.id, userId);
      setSimilarGames(similar.map((s) => ({ game: s.game, similarity: Math.round(s.similarity * 100) })));
    } catch { /* ignore */ }
    finally { setLoadingSimilar(false); }
  }, [game?.id, user, userId]);

  // Load personal note
  useEffect(() => {
    if (!game || !user || !userId) return;
    try {
      const noteData = queries.getGameNote(userId, game.id);
      setNote(noteData?.content || '');
    } catch { /* ignore */ }
    setNoteLoaded(true);
  }, [game?.id, user, userId]);

  // Load game status
  useEffect(() => {
    if (!game || !user || !userId) return;
    try {
      const statuses = queries.getGameStatuses(userId, undefined);
      const entry = statuses.find((s) => s.gameId === game.id);
      setGameStatus(entry?.status ?? null);
    } catch { /* ignore */ }
    setStatusLoaded(true);
  }, [game?.id, user, userId]);

  // Load collections
  useEffect(() => {
    if (!user || !userId) return;
    try {
      setCollections(queries.getCollections(userId));
    } catch { /* ignore */ }
  }, [user, userId]);

  const handleSaveNote = useCallback(() => {
    if (!game || !userId) return;
    setNoteSaving(true);
    try {
      queries.saveGameNote(userId, game.id, note);
      toast('Note saved', 'success');
    } catch { toast('Failed to save note', 'error'); }
    finally { setNoteSaving(false); }
  }, [game, userId, note, toast]);

  const handleSetStatus = useCallback((status: GameStatusType | null) => {
    if (!game || !userId) return;
    try {
      if (status) {
        queries.setGameStatus(userId, game.id, status);
      }
      setGameStatus(status);
      toast(status ? `Marked as ${status.replace('_', ' ')}` : 'Status cleared', 'success');
    } catch { toast('Failed to update status', 'error'); }
  }, [game, userId, toast]);

  const handleLoadReviewSummary = useCallback(() => {
    if (!game) return;
    setLoadingReviewSummary(true);
    // AI review summary requires Ollama/WebLLM integration (Phase 3)
    setReviewSummary('AI review summary requires Ollama or WebLLM setup.');
    setLoadingReviewSummary(false);
  }, [game]);

  const handleAddToCollection = useCallback((collectionId: number) => {
    if (!game) return;
    try {
      queries.addGameToCollection(collectionId, game.id);
      toast('Added to collection', 'success');
      setShowCollections(false);
    } catch { toast('Failed to add to collection', 'error'); }
  }, [game, toast]);

  const handleSwipe = (decision: SwipeDecision) => {
    if (!game || swiping || !userId) return;
    setSwiping(true);
    try {
      queries.recordSwipe(userId, game.id, decision);
      setSwiped(decision);
    } catch {
      // ignore
    } finally {
      setSwiping(false);
    }
  };

  const handleSyncGame = useCallback(async () => {
    if (!appid || syncing) return;
    setSyncing(true);
    try {
      const success = await cacheGame(Number(appid));
      if (success) {
        const refreshed = queries.getGame(Number(appid));
        if (refreshed) {
          setGame(refreshed);
          setMediaItems(null); // Reset media so it rebuilds from fresh data
        }
        toast(t('gameDetail.syncSuccess', 'Game data updated'), 'success');
      } else {
        toast(t('gameDetail.syncFailed', 'Failed to sync game'), 'error');
      }
    } catch {
      toast(t('gameDetail.syncFailed', 'Failed to sync game'), 'error');
    } finally {
      setSyncing(false);
    }
  }, [appid, syncing, toast, t]);

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a]">
        <div className="relative h-[600px] lg:h-[700px] bg-[#242424] animate-pulse" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-20">
          <div className="bg-[#242424] rounded-2xl p-6 mb-8">
            <div className="h-10 w-1/3 bg-[#333] rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-40 bg-[#242424] rounded-2xl animate-pulse" />
              <div className="h-60 bg-[#242424] rounded-2xl animate-pulse" />
            </div>
            <div className="h-96 bg-[#242424] rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-center">
          <i className="fa-solid fa-circle-exclamation text-4xl text-[var(--muted-foreground)] mb-4" />
          <p className="text-lg text-[var(--muted-foreground)] mb-2">{error || t('gameDetail.gameNotFound')}</p>
          <Link to="/" className="text-[var(--primary)] text-sm hover:underline">
            <i className="fa-solid fa-arrow-left mr-1" /> {t('common.goBack')}
          </Link>
        </div>
      </div>
    );
  }

  const releaseYear = getReleaseYear(game.releaseDate);
  const developer = game.developers.length > 0 ? game.developers[0] : null;
  const bookmarked = isBookmarked(game.id);
  const positiveCount = game.reviewScore !== null && game.reviewCount !== null
    ? Math.round(game.reviewCount * game.reviewScore / 100)
    : null;
  const negativeCount = game.reviewCount !== null && positiveCount !== null
    ? game.reviewCount - positiveCount
    : null;

  const heroImage = game.headerImage;

  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      {/* Hero Section */}
      <div className="relative h-[600px] lg:h-[700px] overflow-hidden">
        {/* Background image */}
        {heroImage && (
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/60 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a]/80 via-transparent to-transparent pointer-events-none" />

        {/* Hero content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end h-full pb-28 lg:pb-32">
          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            className="absolute top-6 left-0 flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm cursor-pointer"
          >
            <i className="fa-solid fa-arrow-left" />
            <span>{t('common.back')}</span>
          </button>

          <div className="max-w-4xl">
            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-3 leading-tight">
              {game.name}
            </h1>

            {/* Developer + year */}
            <p className="text-gray-400 text-lg mb-4">
              {developer && <span>{developer}</span>}
              {developer && releaseYear && <span className="mx-2">·</span>}
              {releaseYear && <span>{releaseYear}</span>}
            </p>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              {/* Match badge (show if score-like data could exist — using review score as proxy) */}
              {game.reviewScore !== null && game.reviewScore >= 70 && (
                <span className="bg-[var(--primary)]/20 text-[var(--primary)] px-3 py-1.5 rounded-full font-bold text-sm inline-flex items-center gap-1.5">
                  <i className="fa-solid fa-star" />
                  {t('common.match', { score: game.reviewScore })}
                </span>
              )}

              {/* Review badge */}
              {game.reviewScore !== null && (
                <span
                  className="px-3 py-1.5 rounded-full font-bold text-sm inline-flex items-center gap-1.5"
                  style={{ backgroundColor: reviewBgColor(game.reviewScore), color: reviewColor(game.reviewScore) }}
                >
                  <i className="fa-solid fa-thumbs-up" />
                  {reviewLabel(game.reviewScore)}
                </span>
              )}
            </div>

            {/* Genre pills */}
            {game.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {game.genres.map((genre) => (
                  <span
                    key={genre}
                    className="bg-[#242424]/80 backdrop-blur-sm border border-[#333] px-4 py-2 rounded-lg text-sm font-medium text-white"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Action Row */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8 shadow-2xl -mt-20 relative z-20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Left: utility buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleBookmark(game.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors text-sm font-medium ${
                  bookmarked
                    ? 'bg-[var(--primary)]/20 border-[var(--primary)]/40 text-[var(--primary)]'
                    : 'border-[#444] text-gray-300 hover:bg-[#333] hover:text-white'
                }`}
              >
                <i className={`fa-${bookmarked ? 'solid' : 'regular'} fa-bookmark`} />
                {t('common.bookmark')}
              </button>

              <a
                href={`steam://addtowishlist/${game.id}`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#444] text-gray-300 hover:bg-[#333] hover:text-white transition-colors text-sm font-medium"
              >
                <i className="fa-regular fa-heart" />
                {t('common.wishlist')}
              </a>

              <a
                href={`https://store.steampowered.com/app/${game.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#444] text-gray-300 hover:bg-[#333] hover:text-white transition-colors text-sm font-medium"
              >
                <i className="fa-brands fa-steam" />
                {t('common.openInSteam')}
              </a>

              <button
                onClick={handleSyncGame}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#444] text-gray-300 hover:bg-[#333] hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
              >
                <i className={`fa-solid fa-arrows-rotate ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? t('common.syncing', 'Syncing...') : t('gameDetail.syncGame', 'Sync')}
              </button>

              {/* Game Status Dropdown */}
              {user && statusLoaded && (
                <Select
                  value={gameStatus || ''}
                  onChange={(v) => handleSetStatus(v as GameStatusType || null)}
                  options={[
                    { value: '', label: 'Set Status...' },
                    { value: 'playing', label: 'Playing' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'plan_to_play', label: 'Plan to Play' },
                    { value: 'abandoned', label: 'Abandoned' },
                  ]}
                />
              )}

              {/* Add to Collection */}
              {user && collections.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowCollections(!showCollections)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#444] text-gray-300 hover:bg-[#333] hover:text-white transition-colors text-sm font-medium"
                  >
                    <i className="fa-solid fa-folder-plus" />
                    Collection
                  </button>
                  {showCollections && (
                    <div className="absolute top-full mt-1 right-0 bg-[#242424] border border-[#333] rounded-xl shadow-xl z-30 min-w-[180px]">
                      {collections.map((col) => (
                        <button
                          key={col.id}
                          onClick={() => handleAddToCollection(col.id)}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          <i className={`fa-solid ${col.icon} mr-2`} style={{ color: col.color }} />
                          {col.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: decision buttons */}
            {user && !swiped && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSwipe('no')}
                  disabled={swiping}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <i className="fa-solid fa-xmark" />
                  {t('gameDetail.notForMe')}
                </button>
                <button
                  onClick={() => handleSwipe('maybe')}
                  disabled={swiping}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <i className="fa-solid fa-question" />
                  {t('gameDetail.maybe')}
                </button>
                <button
                  onClick={() => handleSwipe('yes')}
                  disabled={swiping}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <i className="fa-solid fa-check" />
                  {t('gameDetail.interested')}
                </button>
              </div>
            )}

            {swiped && (
              <p className="text-sm text-gray-400">
                You marked this as <span className="font-semibold text-white">{swiped}</span>.
              </p>
            )}
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-16">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Media Gallery Thumbnails */}
            {mediaItems && mediaItems.length > 0 && (
              <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  <i className="fa-solid fa-images mr-2 text-gray-400" />
                  {t('gameDetail.media')}
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {mediaItems.slice(0, 8).map((item, i) => (
                    <button
                      key={i}
                      onClick={() => openGallery(i)}
                      className="relative aspect-video rounded-lg overflow-hidden group cursor-pointer"
                    >
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        {item.type === 'video' && (
                          <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                            <i className="fa-solid fa-play text-white text-xs" />
                          </div>
                        )}
                      </div>
                      {i === 7 && mediaItems.length > 8 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="text-white font-bold">+{mediaItems.length - 8}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price Section */}
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">
                <i className="fa-solid fa-tag mr-2 text-gray-400" />
                {t('gameDetail.price')}
              </h2>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-white">
                  {formatPrice(game.priceCents, game.priceCurrency)}
                </span>
                {game.priceCents !== null && game.priceCents === 0 && (
                  <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-bold">
                    {t('common.free')}
                  </span>
                )}
              </div>
            </div>

            {/* Review Summary */}
            {game.reviewScore !== null && (
              <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  <i className="fa-solid fa-chart-bar mr-2 text-gray-400" />
                  {t('gameDetail.reviewSummary')}
                </h2>
                <div className="flex items-start gap-6">
                  {/* Score box */}
                  <div
                    className="shrink-0 w-20 h-20 rounded-xl flex flex-col items-center justify-center"
                    style={{ backgroundColor: reviewBgColor(game.reviewScore) }}
                  >
                    <span className="text-2xl font-black" style={{ color: reviewColor(game.reviewScore) }}>
                      {game.reviewScore}%
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold mb-1">{reviewLabel(game.reviewScore)}</p>
                    {game.reviewCount !== null && (
                      <p className="text-sm text-gray-400 mb-3">
                        {t('gameDetail.basedOnReviews', { count: game.reviewCount })}
                      </p>
                    )}

                    {/* Progress bars */}
                    {positiveCount !== null && negativeCount !== null && game.reviewCount !== null && game.reviewCount > 0 && (
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-green-400">
                              <i className="fa-solid fa-thumbs-up mr-1" />
                              {t('gameDetail.positive')}
                            </span>
                            <span className="text-gray-400">{positiveCount.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-[#333] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${game.reviewScore}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-red-400">
                              <i className="fa-solid fa-thumbs-down mr-1" />
                              {t('gameDetail.negative')}
                            </span>
                            <span className="text-gray-400">{negativeCount.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-[#333] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 rounded-full"
                              style={{ width: `${100 - (game.reviewScore ?? 0)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* About This Game */}
            {game.shortDesc && (
              <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  <i className="fa-solid fa-info-circle mr-2 text-gray-400" />
                  {t('gameDetail.aboutThisGame')}
                </h2>
                <p className="text-gray-300 leading-relaxed">{game.shortDesc}</p>
              </div>
            )}

            {/* AI Review Summary */}
            {user && (
              <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">
                    <i className="fa-solid fa-brain mr-2 text-purple-400" />
                    AI Review Summary
                  </h2>
                  {!reviewSummary && (
                    <button
                      onClick={handleLoadReviewSummary}
                      disabled={loadingReviewSummary}
                      className="text-xs px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                    >
                      {loadingReviewSummary ? 'Analyzing...' : 'Summarize Reviews'}
                    </button>
                  )}
                </div>
                {reviewSummary ? (
                  <p className="text-sm text-gray-300 leading-relaxed">{reviewSummary}</p>
                ) : (
                  <p className="text-sm text-gray-500">Click "Summarize Reviews" to get an AI-powered summary of what players say about this game.</p>
                )}
              </div>
            )}

            {/* Similar Games */}
            {similarGames.length > 0 && (
              <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  <i className="fa-solid fa-shuffle mr-2 text-blue-400" />
                  Similar Games
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {similarGames.slice(0, 6).map((item) => (
                    <Link key={item.game.id} to={`/game/${item.game.id}`} className="group">
                      <div className="aspect-video rounded-lg overflow-hidden mb-2">
                        {item.game.headerImage ? (
                          <img src={item.game.headerImage} alt={item.game.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full bg-[#333] flex items-center justify-center"><i className="fa-solid fa-gamepad text-gray-500" /></div>
                        )}
                      </div>
                      <p className="text-xs font-semibold truncate">{item.game.name}</p>
                      <p className="text-[10px] text-[var(--primary)]">{item.similarity}% similar</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Personal Note */}
            {user && noteLoaded && (
              <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  <i className="fa-solid fa-sticky-note mr-2 text-amber-400" />
                  Personal Notes
                </h2>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add personal notes about this game..."
                  rows={3}
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)] resize-none mb-3"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={noteSaving}
                  className="text-xs px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                >
                  {noteSaving ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-[#242424] border border-[#333] rounded-2xl p-6 space-y-6">
              <h2 className="text-lg font-bold text-white">
                <i className="fa-solid fa-gamepad mr-2 text-gray-400" />
                {t('gameDetail.gameInformation')}
              </h2>

              {/* Release Date */}
              {game.releaseDate && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">{t('gameDetail.releaseDate')}</h3>
                  <p className="text-sm text-white">{game.releaseDate}</p>
                </div>
              )}

              {/* Genres */}
              {game.genres.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">{t('gameDetail.genres')}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {game.genres.map((genre) => (
                      <span key={genre} className="bg-[#333] text-gray-300 px-2.5 py-1 rounded-md text-xs font-medium">
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Platforms */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">{t('gameDetail.platforms')}</h3>
                <div className="flex items-center gap-3 text-lg">
                  {game.platforms.windows && (
                    <span className="text-gray-300" title="Windows">
                      <i className="fa-brands fa-windows" />
                    </span>
                  )}
                  {game.platforms.mac && (
                    <span className="text-gray-300" title="macOS">
                      <i className="fa-brands fa-apple" />
                    </span>
                  )}
                  {game.platforms.linux && (
                    <span className="text-gray-300" title="Linux">
                      <i className="fa-brands fa-linux" />
                    </span>
                  )}
                  {!game.platforms.windows && !game.platforms.mac && !game.platforms.linux && (
                    <span className="text-gray-500 text-sm">{t('common.unknown')}</span>
                  )}
                </div>
              </div>

              {/* Tags */}
              {game.tags.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">{t('gameDetail.tags')}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {game.tags.slice(0, 12).map((tag) => (
                      <span key={tag} className="bg-[#333] text-gray-400 px-2 py-0.5 rounded text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Developer */}
              {game.developers.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">{t('gameDetail.developer')}</h3>
                  <p className="text-sm text-white">{game.developers.join(', ')}</p>
                </div>
              )}

              {/* Publisher */}
              {game.publishers.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">{t('gameDetail.publisher')}</h3>
                  <p className="text-sm text-white">{game.publishers.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Media Gallery Modal */}
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
