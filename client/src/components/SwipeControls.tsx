import type { SwipeDecision } from '../../../shared/types';

interface SwipeControlsProps {
  onSwipe: (decision: SwipeDecision) => void;
  disabled?: boolean;
}

export default function SwipeControls({ onSwipe, disabled = false }: SwipeControlsProps) {
  return (
    <div className="flex items-center justify-center gap-6 mt-6">
      {/* No */}
      <button
        onClick={() => onSwipe('no')}
        disabled={disabled}
        className="w-14 h-14 rounded-full flex items-center justify-center border-2 text-xl font-bold transition-all hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
        style={{
          borderColor: 'var(--destructive-foreground)',
          color: 'var(--destructive-foreground)',
        }}
        title="Not interested (Left arrow)"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Maybe */}
      <button
        onClick={() => onSwipe('maybe')}
        disabled={disabled}
        className="w-12 h-12 rounded-full flex items-center justify-center border-2 text-lg font-bold transition-all hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
        style={{
          borderColor: 'oklch(0.75 0.18 85)',
          color: 'oklch(0.75 0.18 85)',
        }}
        title="Maybe later (Down arrow)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {/* Yes */}
      <button
        onClick={() => onSwipe('yes')}
        disabled={disabled}
        className="w-14 h-14 rounded-full flex items-center justify-center border-2 text-xl font-bold transition-all hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
        style={{
          borderColor: 'oklch(0.72 0.19 142)',
          color: 'oklch(0.72 0.19 142)',
        }}
        title="Interested (Right arrow)"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    </div>
  );
}
