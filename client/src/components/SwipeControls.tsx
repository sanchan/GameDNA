import type { SwipeDecision } from '../../../shared/types';

interface SwipeControlsProps {
  onSwipe: (decision: SwipeDecision) => void;
  disabled?: boolean;
  onInfo?: () => void;
}

export default function SwipeControls({ onSwipe, disabled = false, onInfo }: SwipeControlsProps) {
  return (
    <div className="flex items-center justify-center space-x-4 mt-6">
      {/* No */}
      <button
        onClick={() => onSwipe('no')}
        disabled={disabled}
        className="group w-16 h-16 bg-red-500/20 hover:bg-red-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-red-500/20"
        title="Not interested (Left arrow)"
      >
        <i className="fa-solid fa-thumbs-down text-xl text-red-500 group-hover:text-white transition-colors duration-300" />
      </button>

      {/* Maybe */}
      <button
        onClick={() => onSwipe('maybe')}
        disabled={disabled}
        className="group w-14 h-14 bg-yellow-500/20 hover:bg-yellow-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-yellow-500/20"
        title="Maybe later (Down arrow)"
      >
        <i className="fa-solid fa-minus text-lg text-yellow-500 group-hover:text-white transition-colors duration-300" />
      </button>

      {/* Yes */}
      <button
        onClick={() => onSwipe('yes')}
        disabled={disabled}
        className="group w-20 h-20 bg-[var(--primary)] hover:bg-[var(--primary)]/80 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg shadow-2xl shadow-[var(--primary)]/50 disabled:opacity-40 disabled:hover:scale-100"
        title="Interested (Right arrow)"
      >
        <i className="fa-solid fa-thumbs-up text-2xl text-white transition-colors duration-300" />
      </button>

      {/* Info */}
      <button
        onClick={onInfo}
        disabled={disabled}
        className="group w-14 h-14 bg-blue-500/20 hover:bg-blue-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-blue-500/20"
        title="More info"
      >
        <i className="fa-solid fa-info text-lg text-blue-500 group-hover:text-white transition-colors duration-300" />
      </button>
    </div>
  );
}
