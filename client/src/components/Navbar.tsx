import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useTranslation } from 'react-i18next';

const navIcons: Record<string, string> = {
  '/discover': 'fa-solid fa-compass',
  '/recommendations': 'fa-solid fa-wand-magic-sparkles',
  '/lists': 'fa-solid fa-layer-group',
  '/history': 'fa-solid fa-clock-rotate-left',
  '/backlog': 'fa-solid fa-bookmark',
  '/chat': 'fa-solid fa-comments',
  '/stats': 'fa-solid fa-chart-pie',
  '/profile': 'fa-solid fa-user',
  '/settings': 'fa-solid fa-gear',
};

export default function Navbar() {
  const { user, loading, login, logout, syncStatus, syncProgress } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();

  const navLinks = [
    { to: '/discover', label: t('nav.discovery') },
    { to: '/recommendations', label: t('nav.recommendations') },
    { to: '/lists', label: t('nav.myLists') },
    { to: '/history', label: t('nav.history') },
    { to: '/backlog', label: t('nav.backlog') },
    { to: '/chat', label: t('nav.chat') },
    { to: '/stats', label: t('nav.stats') },
    { to: '/profile', label: t('nav.profile') },
    { to: '/settings', label: t('nav.settings') },
  ];

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <>
      <nav className="sticky top-0 z-40 bg-[#242424]/95 backdrop-blur-lg border-b border-[#333]">
        <div className="container mx-auto px-4 sm:px-6 xl:px-8 flex items-center justify-between h-16 xl:h-20">
          {/* Left: Hamburger + Logo */}
          <div className="flex items-center gap-2">
            {/* Hamburger button for tablet/mobile — left of logo */}
            {user && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="xl:hidden p-2 -ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Menu"
              >
                <i className="fa-solid fa-bars text-xl" />
              </button>
            )}
            <Link to="/" className="flex items-center gap-0 shrink-0">
              <span className="text-[var(--primary)] text-2xl xl:text-3xl font-black">{t('brand.game')}</span>
              <span className="text-white text-2xl xl:text-3xl font-black">{t('brand.dna')}</span>
            </Link>
          </div>

          {/* Center: Desktop nav links */}
          {user && (
            <div className="hidden xl:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    location.pathname === link.to
                      ? 'bg-[#1a1a1a] text-[var(--primary)]'
                      : 'text-[var(--muted-foreground)] hover:bg-[#1a1a1a] hover:text-[var(--foreground)]'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}

          {/* Right: User pill / Auth */}
          <div className="flex items-center gap-3">
            {loading ? null : user ? (
              <>
                {/* User pill - desktop */}
                <button
                  onClick={logout}
                  className="hidden xl:flex items-center gap-3 bg-[#1a1a1a] rounded-full px-4 py-2 hover:bg-[#222] transition-colors cursor-pointer"
                >
                  {user.avatarUrl && (
                    <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                  )}
                  <span className="text-sm text-white">{user.displayName}</span>
                  <i className="fa-solid fa-chevron-down text-xs text-[var(--muted-foreground)]" />
                </button>
              </>
            ) : (
              <button
                onClick={login}
                className="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t('common.signInWithSteam')}
              </button>
            )}
          </div>
        </div>

        {/* Sync progress banner */}
        {user && syncStatus === 'syncing' && syncProgress && (
          <div className="bg-[#242424] border-b border-[#333] px-4 py-2">
            <div className="container mx-auto px-4 sm:px-6 xl:px-8">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-[var(--foreground)]">{syncProgress.detail}</span>
                <span className="text-xs text-[var(--muted-foreground)]">{syncProgress.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] rounded-full"
                  style={{
                    width: `${syncProgress.progress}%`,
                    transition: 'width 0.5s ease-out',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Sidebar overlay + panel (tablet/mobile only) */}
      {user && (
        <div
          className={`xl:hidden fixed inset-0 z-50 transition-visibility ${sidebarOpen ? 'visible' : 'invisible'}`}
        >
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar panel */}
          <div
            className={`absolute top-0 left-0 h-full w-72 bg-[#1a1a1a] border-r border-[#333] flex flex-col transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-[#333] shrink-0">
              <Link to="/" className="flex items-center gap-0" onClick={() => setSidebarOpen(false)}>
                <span className="text-[var(--primary)] text-2xl font-black">{t('brand.game')}</span>
                <span className="text-white text-2xl font-black">{t('brand.dna')}</span>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-[var(--muted-foreground)] hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <i className="fa-solid fa-xmark text-xl" />
              </button>
            </div>

            {/* User info */}
            <div className="px-5 py-4 border-b border-[#333] shrink-0">
              <div className="flex items-center gap-3">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Steam</p>
                </div>
              </div>
            </div>

            {/* Nav links */}
            <div className="flex-1 overflow-y-auto py-3 px-3">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.to;
                const icon = navIcons[link.to];
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                      isActive
                        ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                        : 'text-[var(--muted-foreground)] hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {icon && <i className={`${icon} w-5 text-center text-base`} />}
                    {link.label}
                  </Link>
                );
              })}
            </div>

            {/* Logout button at bottom */}
            <div className="px-3 py-4 border-t border-[#333] shrink-0">
              <button
                onClick={() => { logout(); setSidebarOpen(false); }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
              >
                <i className="fa-solid fa-right-from-bracket w-5 text-center text-base" />
                {t('common.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
