import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface MediaItem {
  type: 'image' | 'video';
  thumbnail: string;
  full: string;
  videoSrc?: string;
}

interface MediaGalleryProps {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

export default function MediaGallery({ items, initialIndex, onClose }: MediaGalleryProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [closing, setClosing] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const current = items[index];

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  const goNext = useCallback(() => {
    setPlayingVideo(false);
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  const goPrev = useCallback(() => {
    setPlayingVideo(false);
    setIndex((i) => (i - 1 + items.length) % items.length);
  }, [items.length]);

  // Keyboard navigation + focus trap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        goNext();
      } else if (e.key === 'Tab' && galleryRef.current) {
        const focusable = galleryRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), video'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [close, goNext, goPrev]);

  // Lock body scroll + manage focus
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const closeBtn = galleryRef.current?.querySelector<HTMLElement>('button');
      closeBtn?.focus();
    });
    return () => {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <div
      ref={galleryRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('mediaGallery.counter', { current: index + 1, total: items.length })}
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        closing ? 'gallery-zoom-out' : 'gallery-zoom-in'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/90"
        onClick={close}
      />

      {/* Close button */}
      <button
        onClick={close}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        title={t('mediaGallery.closeEsc')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-4 z-10 text-white/70 text-sm">
        {t('mediaGallery.counter', { current: index + 1, total: items.length })}
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-5xl mx-4 aspect-video flex items-center justify-center">
        {current.type === 'video' && !playingVideo ? (
          // Video thumbnail with play button
          <div className="relative w-full h-full cursor-pointer" onClick={() => setPlayingVideo(true)}>
            <img
              src={current.thumbnail}
              alt=""
              className="w-full h-full object-contain rounded-lg"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                  <polygon points="6,3 20,12 6,21" />
                </svg>
              </div>
            </div>
          </div>
        ) : current.type === 'video' && playingVideo && current.videoSrc ? (
          <video
            src={current.videoSrc}
            poster={current.thumbnail}
            controls
            autoPlay
            className="w-full h-full object-contain rounded-lg"
          />
        ) : (
          <img
            src={current.full}
            alt=""
            className="w-full h-full object-contain rounded-lg"
          />
        )}
      </div>

      {/* Nav arrows */}
      {items.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            title={t('mediaGallery.previous')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            title={t('mediaGallery.next')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Thumbnail strip */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 max-w-[90vw] overflow-x-auto px-2 py-1.5 rounded-lg bg-black/50">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { setPlayingVideo(false); setIndex(i); }}
              className={`relative shrink-0 w-16 h-9 rounded overflow-hidden border-2 transition-all ${
                i === index ? 'border-white scale-105' : 'border-transparent opacity-60 hover:opacity-90'
              }`}
            >
              <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
              {item.type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none" className="drop-shadow">
                    <polygon points="6,3 20,12 6,21" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .gallery-zoom-in {
          animation: galleryIn 0.25s ease-out forwards;
        }
        .gallery-zoom-out {
          animation: galleryOut 0.25s ease-in forwards;
        }
        @keyframes galleryIn {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes galleryOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
