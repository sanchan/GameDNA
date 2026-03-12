import { useTranslation } from 'react-i18next';
import type { SwipeDecision } from '../../../shared/types';

interface SwipeControlsProps {
  onSwipe: (decision: SwipeDecision) => void;
  disabled?: boolean;
}

export default function SwipeControls({ onSwipe, disabled = false }: SwipeControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center space-x-4 mt-6">
      {/* No */}
      <button
        onClick={() => onSwipe('no')}
        disabled={disabled}
        className="group w-16 h-16 bg-red-500/20 hover:bg-red-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-red-500/20"
        title={t('swipe.notInterested')}
        aria-label={t('swipe.notInterested')}
      >
        <i className="fa-solid fa-thumbs-down text-2xl text-red-500 group-hover:text-white transition-colors duration-300" aria-hidden="true" />
        <span className="sr-only">{t('swipe.notInterested')}</span>
      </button>

      {/* Maybe */}
      <button
        onClick={() => onSwipe('maybe')}
        disabled={disabled}
        className="group w-16 h-16 bg-gray-500/20 hover:bg-gray-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-gray-500/20"
        title={t('swipe.maybeLater')}
        aria-label={t('swipe.maybeLater')}
      >
        <i className="fa-solid fa-minus text-2xl text-gray-400 group-hover:text-white transition-colors duration-300" aria-hidden="true" />
        <span className="sr-only">{t('swipe.maybeLater')}</span>
      </button>

      {/* Yes */}
      <button
        onClick={() => onSwipe('yes')}
        disabled={disabled}
        className="group w-16 h-16 bg-green-500/20 hover:bg-green-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-green-500/20"
        title={t('swipe.interested')}
        aria-label={t('swipe.interested')}
      >
        <i className="fa-solid fa-thumbs-up text-2xl text-green-500 group-hover:text-white transition-colors duration-300" aria-hidden="true" />
        <span className="sr-only">{t('swipe.interested')}</span>
      </button>
    </div>
  );
}
