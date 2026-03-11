import { useEffect, useState, useRef } from 'react';

interface WhyThisGameProps {
  gameId: number;
  gameName: string;
  gameImage?: string | null;
  open: boolean;
  onClose: () => void;
}

export default function WhyThisGame({ gameId, gameName, gameImage, open, onClose }: WhyThisGameProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[var(--card)] text-[var(--card-foreground)] rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        {/* Header */}
        {gameImage && (
          <img
            src={gameImage}
            alt={gameName}
            className="w-full aspect-video object-cover"
          />
        )}

        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold">Why {gameName}?</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="p-4 overflow-y-auto flex-1">
          {error ? (
            <p className="text-[var(--destructive-foreground)]">{error}</p>
          ) : (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {text}
              {loading && (
                <span className="inline-block w-1.5 h-4 bg-[var(--primary)] ml-0.5 animate-pulse" />
              )}
            </div>
          )}
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
}
