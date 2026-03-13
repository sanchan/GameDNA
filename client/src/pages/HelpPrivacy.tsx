import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export default function HelpPrivacy() {
  const { t } = useTranslation();

  const principles = [
    {
      icon: 'fa-solid fa-hard-drive',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      titleKey: 'localFirst',
    },
    {
      icon: 'fa-solid fa-eye-slash',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      titleKey: 'noTracking',
    },
    {
      icon: 'fa-solid fa-robot',
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      titleKey: 'localAi',
    },
    {
      icon: 'fa-solid fa-trash-can',
      color: 'text-red-400',
      bg: 'bg-red-500/20',
      titleKey: 'fullControl',
    },
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to="/help" className="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-flex items-center gap-1">
            <i className="fa-solid fa-arrow-left" /> {t('help.title')}
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">{t('help.privacyTitle')}</h1>
          <p className="text-gray-400">{t('help.privacyDesc')}</p>
        </div>

        {/* Privacy principles */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-green-400" />
            {t('helpPrivacy.principlesTitle')}
          </h2>
          <div className="space-y-4">
            {principles.map((p) => (
              <div key={p.titleKey} className="flex items-start gap-4 bg-[#1a1a1a] rounded-xl p-4">
                <div className={`w-10 h-10 rounded-lg ${p.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <i className={`${p.icon} ${p.color}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">
                    {t(`helpPrivacy.${p.titleKey}.title`)}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {t(`helpPrivacy.${p.titleKey}.desc`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What we access */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-list-check text-blue-400" />
            {t('helpPrivacy.whatWeAccessTitle')}
          </h2>
          <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
            <div>
              <h3 className="font-semibold text-white mb-2">{t('helpPrivacy.weAccess')}</h3>
              <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                <li>{t('helpPrivacy.access.profile')}</li>
                <li>{t('helpPrivacy.access.games')}</li>
                <li>{t('helpPrivacy.access.wishlist')}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">{t('helpPrivacy.weNeverAccess')}</h3>
              <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                <li>{t('helpPrivacy.neverAccess.password')}</li>
                <li>{t('helpPrivacy.neverAccess.email')}</li>
                <li>{t('helpPrivacy.neverAccess.payment')}</li>
                <li>{t('helpPrivacy.neverAccess.messages')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Data storage */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-database text-amber-400" />
            {t('helpPrivacy.dataStorageTitle')}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            {t('helpPrivacy.dataStorageDesc')}
          </p>
        </div>

        {/* Your rights */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-user-shield text-[var(--primary)]" />
            {t('helpPrivacy.yourRightsTitle')}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed mb-3">
            {t('helpPrivacy.yourRightsDesc')}
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] border border-[#333] text-gray-300 rounded-xl text-sm font-medium hover:border-[#444] hover:text-white transition-colors"
          >
            <i className="fa-solid fa-gear" />
            {t('helpPrivacy.goToSettings')}
          </Link>
        </div>

        {/* Full legal link */}
        <div className="text-center mt-8">
          <Link
            to="/legal"
            className="text-sm text-[var(--primary)] hover:underline"
          >
            {t('helpPrivacy.viewFullLegal')}
          </Link>
        </div>
      </div>
    </div>
  );
}
