import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { config } from '../services/config';

export default function HelpMatch() {
  const { t } = useTranslation();
  const w = config.scoring;

  const factors = [
    {
      key: 'genre',
      icon: 'fa-solid fa-masks-theater',
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      barBg: 'bg-purple-500/60',
      weight: w.genreWeight,
    },
    {
      key: 'tag',
      icon: 'fa-solid fa-tags',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      barBg: 'bg-blue-500/60',
      weight: w.tagWeight,
    },
    {
      key: 'review',
      icon: 'fa-solid fa-thumbs-up',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      barBg: 'bg-green-500/60',
      weight: w.reviewWeight,
    },
    {
      key: 'recency',
      icon: 'fa-solid fa-calendar',
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      barBg: 'bg-amber-500/60',
      weight: w.recencyWeight,
    },
  ];

  const signals = [
    { key: 'library', icon: 'fa-solid fa-gamepad', color: 'text-[var(--primary)]' },
    { key: 'wishlist', icon: 'fa-solid fa-heart', color: 'text-pink-400' },
    { key: 'swipes', icon: 'fa-solid fa-hand-pointer', color: 'text-green-400' },
    { key: 'bookmarks', icon: 'fa-solid fa-bookmark', color: 'text-amber-400' },
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to="/help" className="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-flex items-center gap-1">
            <i className="fa-solid fa-arrow-left" /> {t('help.title')}
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">{t('help.matchTitle')}</h1>
          <p className="text-gray-400">{t('help.matchDesc')}</p>
        </div>

        {/* Overview */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-star text-[var(--primary)]" />
            {t('matchExplainer.howItWorks')}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            {t('matchExplainer.description')}
          </p>
          <div className="bg-[#141414] border border-[#333] rounded-xl p-4">
            <p className="text-xs font-mono text-gray-400 mb-2">{t('matchExplainer.formula')}</p>
            <code className="text-sm text-[var(--primary)] font-mono block leading-relaxed">
              score = {w.genreWeight} × genre + {w.tagWeight} × tags + {w.reviewWeight} × reviews + {w.recencyWeight} × recency
            </code>
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">{t('matchExplainer.factors')}</h2>
          <div className="space-y-4">
            {factors.map((f) => (
              <div key={f.key} className="flex items-start gap-4 bg-[#1a1a1a] rounded-xl p-4">
                <div className={`w-10 h-10 rounded-lg ${f.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <i className={`${f.icon} ${f.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white">
                      {t(`matchExplainer.factor.${f.key}.title`)}
                    </span>
                    <span className="text-sm font-mono text-gray-500">{Math.round(f.weight * 100)}%</span>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {t(`matchExplainer.factor.${f.key}.desc`)}
                  </p>
                  <div className="mt-2 w-full h-2 bg-[#242424] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${f.barBg}`}
                      style={{ width: `${f.weight * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Taste Profile */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-dna text-[var(--primary)]" />
            {t('matchExplainer.tasteProfileTitle')}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            {t('matchExplainer.tasteProfileDesc')}
          </p>

          <div className="space-y-3 mb-4">
            {signals.map((s) => (
              <div key={s.key} className="flex items-start gap-3 bg-[#1a1a1a] rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-[#242424] flex items-center justify-center shrink-0 mt-0.5">
                  <i className={`${s.icon} ${s.color} text-sm`} />
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {t(`matchExplainer.tasteProfileSignals.${s.key}`)}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-[#141414] border border-[#333] rounded-xl p-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-gray-300 font-medium">How scores stay proportional: </span>
              {t('matchExplainer.tasteProfileNormalization')}
            </p>
          </div>
        </div>

        {/* Pool Expansion */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-magnifying-glass-plus text-cyan-400" />
            {t('matchExplainer.poolExpansionTitle')}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            {t('matchExplainer.poolExpansionDesc')}
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3 bg-[#1a1a1a] rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <i className="fa-solid fa-magnifying-glass text-cyan-400 text-sm" />
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                {t('matchExplainer.poolExpansionPoints.search')}
              </p>
            </div>
            <div className="flex items-start gap-3 bg-[#1a1a1a] rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <i className="fa-solid fa-gem text-emerald-400 text-sm" />
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                {t('matchExplainer.poolExpansionPoints.noPopGate')}
              </p>
            </div>
          </div>
        </div>

        {/* Learning Loop */}
        <div className="bg-gradient-to-br from-[var(--primary)]/5 to-purple-600/5 border border-[var(--primary)]/20 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-arrows-spin text-[var(--primary)]" />
            {t('matchExplainer.learningLoopTitle')}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            {t('matchExplainer.learningLoopDesc')}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="px-3 py-1.5 bg-[#1a1a1a] rounded-full text-gray-300">Swipe / Bookmark</span>
            <i className="fa-solid fa-arrow-right text-[var(--primary)]" />
            <span className="px-3 py-1.5 bg-[#1a1a1a] rounded-full text-gray-300">Profile updates</span>
            <i className="fa-solid fa-arrow-right text-[var(--primary)]" />
            <span className="px-3 py-1.5 bg-[#1a1a1a] rounded-full text-gray-300">New game searches</span>
            <i className="fa-solid fa-arrow-right text-[var(--primary)]" />
            <span className="px-3 py-1.5 bg-[#1a1a1a] rounded-full text-gray-300">Better matches</span>
            <i className="fa-solid fa-rotate-left text-[var(--primary)]" />
          </div>
        </div>

        {/* AI Layer */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-brain text-purple-400" />
            {t('matchExplainer.aiLayerTitle')}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            {t('matchExplainer.aiLayerDesc')}
          </p>
        </div>
      </div>
    </div>
  );
}
