import type { SwipeDecision } from '../../../shared/types';

interface SwipeControlsProps {
  onSwipe: (decision: SwipeDecision) => void;
  disabled?: boolean;
}

export default function SwipeControls({ onSwipe, disabled = false }: SwipeControlsProps) {
  return (
    <div className="flex items-center justify-center space-x-4 mt-6">
      {/* No */}
      <button
        onClick={() => onSwipe('no')}
        disabled={disabled}
        className="group w-16 h-16 bg-red-500/20 hover:bg-red-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-red-500/20"
        title="Not interested (Left arrow)"
      >
        <i className="fa-solid fa-thumbs-down text-2xl text-red-500 group-hover:text-white transition-colors duration-300" />
      </button>

      {/* Maybe */}
      <button
        onClick={() => onSwipe('maybe')}
        disabled={disabled}
        className="group w-16 h-16 bg-gray-500/20 hover:bg-gray-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-gray-500/20"
        title="Maybe later (Down arrow)"
      >
        <i className="fa-solid fa-minus text-2xl text-gray-400 group-hover:text-white transition-colors duration-300" />
      </button>

      {/* Yes */}
      <button
        onClick={() => onSwipe('yes')}
        disabled={disabled}
        className="group w-16 h-16 bg-green-500/20 hover:bg-green-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-green-500/20"
        title="Interested (Right arrow)"
      >
        <i className="fa-solid fa-thumbs-up text-2xl text-green-500 group-hover:text-white transition-colors duration-300" />
      </button>
    </div>
  );
}
