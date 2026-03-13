import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { explainRecommendation } from '../services/ai-features';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';

interface WhyThisGameProps {
  recId?: number;
  gameId: number;
  gameName: string;
  gameImage?: string | null;
  gameDeveloper?: string;
  matchScore?: number;
  aiExplanation?: string | null;
  open: boolean;
  onClose: () => void;
  onExplanationSaved?: (recId: number, explanation: string) => void;
}

export default function WhyThisGame({
  recId,
  gameId,
  gameName,
  gameImage,
  gameDeveloper,
  matchScore,
  aiExplanation,
  open,
  onClose,
  onExplanationSaved,
}: WhyThisGameProps) {
  const { t } = useTranslation();
  const { userId } = useDb();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
  }, [onClose]);

  // Manage focus on open/close
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    // Focus the modal after render
    requestAnimationFrame(() => {
      const closeBtn = modalRef.current?.querySelector<HTMLElement>('button');
      closeBtn?.focus();
    });
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  const startGeneration = useCallback(() => {
    // Cancel any in-flight generation
    cancelRef.current?.();

    if (!userId) {
      setError(t('whyThisGame.failedToLoad'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setText('');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;
    let fullText = '';

    cancelRef.current = () => {
      cancelled = true;
      controller.abort();
    };

    (async () => {
      try {
        for await (const chunk of explainRecommendation(userId, gameId)) {
          if (cancelled) break;
          fullText += chunk;
          setText(fullText);
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }
        if (!cancelled && fullText && recId && userId) {
          queries.updateRecommendationExplanation(recId, userId, fullText);
          onExplanationSaved?.(recId, fullText);
        }
        if (!cancelled) setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(t('whyThisGame.failedToLoad'));
          setLoading(false);
        }
      }
    })();
  }, [userId, gameId, recId, onExplanationSaved, t]);

  useEffect(() => {
    if (!open) {
      cancelRef.current?.();
      setText('');
      setError(null);
      return;
    }

    // If we already have a stored AI explanation, use it directly
    if (aiExplanation) {
      setText(aiExplanation);
      setLoading(false);
      return;
    }

    // Otherwise generate one via the local AI engine
    startGeneration();
    return () => cancelRef.current?.();
  }, [open, gameId, aiExplanation]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = () => {
    startGeneration();
  };

  if (!open) return null;

  const matchPercent = matchScore != null ? Math.round(matchScore * 100) : null;
  const isHighConfidence = matchScore != null && matchScore >= 0.7;
  const hasStoredExplanation = !!aiExplanation || (!loading && !!text && !error);

  const modal = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={gameName}>
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div ref={modalRef} className="relative bg-[#242424] border-2 border-[var(--primary)] rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl animate-[fadeIn_0.2s_ease-out]">
        {/* Header */}
        <div className="bg-[#1a1a1a] border-b border-[#333] p-6">
          <div className="flex items-start gap-4">
            {gameImage && (
              <img
                src={gameImage}
                alt={gameName}
                className="h-20 w-32 object-cover rounded-lg shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black leading-tight mb-1">{gameName}</h2>
              {gameDeveloper && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  <i className="fa-solid fa-code mr-1.5" />
                  {gameDeveloper}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                {matchPercent != null && (
                  <span className="bg-[var(--primary)]/90 px-3 py-1 rounded-full text-xs font-bold">
                    {t('common.match', { score: matchPercent })}
                  </span>
                )}
                {isHighConfidence && (
                  <span className="bg-[oklch(0.72_0.19_142)]/20 text-[oklch(0.72_0.19_142)] border border-[oklch(0.72_0.19_142)]/50 px-3 py-1 rounded-full text-xs font-bold">
                    <i className="fa-solid fa-check mr-1" />
                    {t('whyThisGame.highConfidence')}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-lg flex items-center justify-center transition-colors shrink-0"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={contentRef} className="p-6 overflow-y-auto max-h-[calc(90vh-280px)]">
          {/* AI Explanation */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-brain" />
                {t('whyThisGame.aiExplanation')}
              </h3>
              {hasStoredExplanation && !loading && (
                <button
                  onClick={handleRegenerate}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-rotate-right" />
                  {t('whyThisGame.regenerate')}
                </button>
              )}
            </div>
            <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-5">
              {error ? (
                <p className="text-red-400">{error}</p>
              ) : loading && !text ? (
                <div className="space-y-3">
                  <div className="h-4 w-full bg-[#333] rounded animate-pulse" />
                  <div className="h-4 w-11/12 bg-[#333] rounded animate-pulse" />
                  <div className="h-4 w-4/5 bg-[#333] rounded animate-pulse" />
                  <div className="h-4 w-full bg-[#333] rounded animate-pulse" />
                  <div className="h-4 w-3/4 bg-[#333] rounded animate-pulse" />
                  <div className="h-4 w-5/6 bg-[#333] rounded animate-pulse" />
                </div>
              ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {text}
                  {loading && (
                    <span className="inline-block w-2 h-5 bg-[var(--primary)] ml-1 animate-pulse" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
