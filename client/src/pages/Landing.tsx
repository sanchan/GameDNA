import { useDb } from '../contexts/db-context';
import { useAuth } from '../hooks/use-auth';
import { Navigate, useNavigate, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Logo } from '../components/Logo';

export default function Landing() {
  const { user, loading } = useAuth();
  const { config } = useDb();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const login = () => navigate('/onboarding');

  if (loading) return null;
  if (user && config?.setupComplete) return <Navigate to="/discover" />;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-[var(--primary)] rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-600 rounded-full blur-3xl" />
      </div>

      {/* Container */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left column - Hero content */}
          <div className="order-2 lg:order-1">
            <h1 className="mb-6">
              <Logo size="lg" />
            </h1>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              {t('landing.heroTitle')}
              <span className="text-[var(--primary)] block mt-2">{t('landing.heroTitleHighlight')}</span>
            </h2>

            <p className="text-lg sm:text-xl text-[var(--text-muted)] mb-8 lg:mb-10">
              {t('landing.heroDescription')}
            </p>

            <button
              onClick={login}
              className="bg-gradient-to-r from-[#1b2838] to-[#2a475e] hover:from-[#2a475e] hover:to-[#3a5a7e] text-[var(--foreground)] px-10 py-5 rounded-xl text-lg sm:text-xl font-semibold transition-all duration-300 flex items-center gap-3 mb-8 cursor-pointer"
            >
              <i className="fa-brands fa-steam text-2xl" />
              {t('common.signInWithSteam')}
              <i className="fa-solid fa-arrow-right" />
            </button>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-3 mb-8">
              <span className="bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-full text-sm text-[var(--text-body)] flex items-center gap-2">
                <i className="fa-solid fa-brain text-[var(--primary)]" />
                {t('landing.featureAI')}
              </span>
              <span className="bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-full text-sm text-[var(--text-body)] flex items-center gap-2">
                <i className="fa-solid fa-hand-pointer text-[var(--primary)]" />
                {t('landing.featureSwipe')}
              </span>
              <span className="bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-full text-sm text-[var(--text-body)] flex items-center gap-2">
                <i className="fa-solid fa-chart-pie text-[var(--primary)]" />
                {t('landing.featureTaste')}
              </span>
              <span className="bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-full text-sm text-[var(--text-body)] flex items-center gap-2">
                <i className="fa-solid fa-bookmark text-[var(--primary)]" />
                {t('landing.featureBacklog')}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">50K+</div>
                <div className="text-sm text-[var(--text-muted)]">{t('landing.statsGames')}</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">10K+</div>
                <div className="text-sm text-[var(--text-muted)]">{t('landing.statsUsers')}</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">98%</div>
                <div className="text-sm text-[var(--text-muted)]">{t('landing.statsMatch')}</div>
              </div>
            </div>
          </div>

          {/* Right column - Card stack preview */}
          <div className="order-1 lg:order-2 flex justify-center">
            <div className="relative w-80 h-[420px]">
              {/* Background card 3 */}
              <div className="absolute inset-x-4 top-0 bottom-0 bg-[#1a1a2e] rounded-2xl border border-[var(--border)] translate-y-4 scale-[0.92] z-0" />
              {/* Background card 2 */}
              <div className="absolute inset-x-2 top-0 bottom-0 bg-[#1e1e32] rounded-2xl border border-[var(--border)] translate-y-2 scale-[0.96] z-10" />
              {/* Main card */}
              <div className="relative bg-[#242438] rounded-2xl border border-[var(--muted)] overflow-hidden z-20 h-full flex flex-col">
                {/* Card image area */}
                <div className="h-48 bg-gradient-to-br from-[var(--primary)]/30 to-purple-600/30 flex items-center justify-center">
                  <i className="fa-solid fa-gamepad text-6xl text-[var(--foreground)]/30" />
                </div>
                {/* Card content */}
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-xl font-bold text-[var(--foreground)] mb-1">{t('landing.cardTitle')}</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-3">{t('landing.cardSubtitle')}</p>
                  <div className="flex flex-wrap gap-2 mb-auto">
                    <span className="bg-[var(--primary)]/20 text-[var(--primary)] px-2.5 py-1 rounded-md text-xs font-medium">RPG</span>
                    <span className="bg-purple-600/20 text-purple-400 px-2.5 py-1 rounded-md text-xs font-medium">Action</span>
                    <span className="bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-md text-xs font-medium">Open World</span>
                  </div>
                  {/* Swipe buttons */}
                  <div className="flex justify-center gap-4 mt-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                      <i className="fa-solid fa-xmark text-red-400 text-lg" />
                    </div>
                    <div className="w-12 h-12 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center">
                      <i className="fa-solid fa-bookmark text-yellow-400 text-lg" />
                    </div>
                    <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                      <i className="fa-solid fa-heart text-green-400 text-lg" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 py-4 text-center z-10">
        <p className="text-xs text-gray-500">
          GameDNA is not affiliated with Valve or Steam.{' '}
          <Link to="/legal" className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors underline">
            Privacy & Legal
          </Link>
        </p>
      </div>
    </div>
  );
}
