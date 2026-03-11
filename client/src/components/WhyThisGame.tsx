import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface WhyThisGameProps {
  gameId: number;
  gameName: string;
  gameImage?: string | null;
  gameDeveloper?: string;
  matchScore?: number;
  open: boolean;
  onClose: () => void;
}

export default function WhyThisGame({
  gameId,
  gameName,
  gameImage,
  gameDeveloper,
  matchScore,
  open,
  onClose,
}: WhyThisGameProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setText('');
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setText('');
    setError(null);

    (async () => {
      try {
        const res = await fetch(`/api/recommendations/${gameId}/explain`, {
          credentials: 'include',
          signal: controller.signal,
        });

        if (!res.ok) {
          setError('Failed to load explanation.');
          setLoading(false);
          return;
        }

        if (!res.body) {
          const fullText = await res.text();
          setText(fullText);
          setLoading(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setText((prev) => prev + chunk);

          // Auto-scroll
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }

        setLoading(false);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError('Failed to load explanation.');
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [open, gameId]);

  if (!open) return null;

  const matchPercent = matchScore != null ? Math.round(matchScore * 100) : null;
  const isHighConfidence = matchScore != null && matchScore >= 0.7;

  const modal = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#242424] border-2 border-[var(--primary)] rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl animate-[fadeIn_0.2s_ease-out]">
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
                    {matchPercent}% Match
                  </span>
                )}
                {isHighConfidence && (
                  <span className="bg-[oklch(0.72_0.19_142)]/20 text-[oklch(0.72_0.19_142)] border border-[oklch(0.72_0.19_142)]/30 px-3 py-1 rounded-full text-xs font-bold">
                    <i className="fa-solid fa-check mr-1" />
                    High Confidence
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
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3 flex items-center gap-2">
              <i className="fa-solid fa-brain" />
              AI Explanation
            </h3>
            <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-5">
              {error ? (
                <p className="text-red-400">{error}</p>
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
