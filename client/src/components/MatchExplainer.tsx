import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { config } from '../services/config';

interface MatchExplainerProps {
  score: number;
  onClose: () => void;
}

export default function MatchExplainer({ score, onClose }: MatchExplainerProps) {
  const { t } = useTranslation();
  const rounded = Math.round(score);

  const weights = config.scoring;
  const factors = [
    {
      key: 'genre',
      icon: 'fa-solid fa-masks-theater',
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      weight: weights.genreWeight,
    },
    {
      key: 'tag',
      icon: 'fa-solid fa-tags',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      weight: weights.tagWeight,
    },
    {
      key: 'review',
      icon: 'fa-solid fa-thumbs-up',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      weight: weights.reviewWeight,
    },
    {
      key: 'recency',
      icon: 'fa-solid fa-calendar',
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      weight: weights.recencyWeight,
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] border border-[#333] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[#333]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
              <i className="fa-solid fa-star text-[var(--primary)] text-lg" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{t('matchExplainer.title')}</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                {t('common.match', { score: rounded })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#333] hover:bg-[#444] flex items-center justify-center transition-colors"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Formula overview */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">{t('matchExplainer.howItWorks')}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {t('matchExplainer.description')}
            </p>
          </div>

          {/* Scoring formula */}
          <div className="bg-[#141414] border border-[#333] rounded-xl p-4">
            <p className="text-xs font-mono text-gray-400 mb-3">{t('matchExplainer.formula')}</p>
            <code className="text-sm text-[var(--primary)] font-mono block leading-relaxed">
              score = {weights.genreWeight} × genre + {weights.tagWeight} × tags + {weights.reviewWeight} × reviews + {weights.recencyWeight} × recency
            </code>
          </div>

          {/* Factor breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">{t('matchExplainer.factors')}</h3>
            <div className="space-y-3">
              {factors.map((f) => (
                <div key={f.key} className="flex items-start gap-3 bg-[#242424] rounded-xl p-3">
                  <div className={`w-9 h-9 rounded-lg ${f.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <i className={`${f.icon} ${f.color} text-sm`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-white">
                        {t(`matchExplainer.factor.${f.key}.title`)}
                      </span>
                      <span className="text-xs font-mono text-gray-500">{Math.round(f.weight * 100)}%</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {t(`matchExplainer.factor.${f.key}.desc`)}
                    </p>
                    {/* Weight bar */}
                    <div className="mt-2 w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${f.bg.replace('/20', '/60')}`}
                        style={{ width: `${f.weight * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Taste profile explanation */}
          <div className="bg-[#242424] border border-[#333] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <i className="fa-solid fa-dna text-[var(--primary)]" />
              {t('matchExplainer.tasteProfileTitle')}
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {t('matchExplainer.tasteProfileDesc')} {t('matchExplainer.tasteProfileSignals.library')} {t('matchExplainer.tasteProfileSignals.swipes')}
            </p>
          </div>

          {/* AI layer note */}
          <div className="bg-[#242424] border border-[#333] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <i className="fa-solid fa-brain text-purple-400" />
              {t('matchExplainer.aiLayerTitle')}
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {t('matchExplainer.aiLayerDesc')}
            </p>
          </div>

          {/* Link to full page */}
          <div className="text-center pt-1">
            <Link
              to="/help/match"
              onClick={onClose}
              className="text-sm text-[var(--primary)] hover:text-[var(--primary)]/80 font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              {t('matchExplainer.learningLoopTitle')}, {t('matchExplainer.poolExpansionTitle').toLowerCase()}, and more
              <i className="fa-solid fa-arrow-right text-xs" />
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
