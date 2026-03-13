import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export default function Help() {
  const { t } = useTranslation();

  const sections = [
    {
      to: '/help/match',
      icon: 'fa-solid fa-star',
      color: 'text-[var(--primary)]',
      bg: 'bg-[var(--primary)]/20',
      title: t('help.matchTitle'),
      desc: t('help.matchDesc'),
    },
    {
      to: '/help/privacy',
      icon: 'fa-solid fa-shield-halved',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      title: t('help.privacyTitle'),
      desc: t('help.privacyDesc'),
    },
    {
      to: '/legal',
      icon: 'fa-solid fa-scale-balanced',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      title: t('help.legalTitle'),
      desc: t('help.legalDesc'),
    },
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">{t('help.title')}</h1>
          <p className="text-gray-400">{t('help.subtitle')}</p>
        </div>

        <div className="space-y-4">
          {sections.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="block bg-[#242424] border border-[#333] rounded-2xl p-6 hover:border-[var(--primary)] transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                  <i className={`${s.icon} ${s.color} text-lg`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white group-hover:text-[var(--primary)] transition-colors">
                    {s.title}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">{s.desc}</p>
                </div>
                <i className="fa-solid fa-chevron-right text-gray-600 group-hover:text-[var(--primary)] transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
