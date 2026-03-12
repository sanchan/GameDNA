import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useTranslation } from 'react-i18next';

export default function Navbar() {
  const { user, loading, login, logout, syncStatus, syncProgress } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useTranslation();

  const navLinks = [
    { to: '/discover', label: t('nav.discovery') },
    { to: '/recommendations', label: t('nav.recommendations') },
    { to: '/lists', label: t('nav.myLists') },
    { to: '/history', label: t('nav.history') },
    { to: '/backlog', label: t('nav.backlog') },
    { to: '/profile', label: t('nav.profile') },
  ];

  return (
    <nav className="sticky top-0 z-40 bg-[#242424]/95 backdrop-blur-lg border-b border-[#333]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 lg:h-20">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-0 shrink-0">
          <span className="text-[var(--primary)] text-2xl lg:text-3xl font-black">{t('brand.game')}</span>
          <span className="text-white text-2xl lg:text-3xl font-black">{t('brand.dna')}</span>
        </Link>

        {/* Center: Desktop nav links */}
        {user && (
          <div className="hidden lg:flex items-center gap-1">
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
              {/* User pill */}
              <button
                onClick={logout}
                className="hidden sm:flex items-center gap-3 bg-[#1a1a1a] rounded-full px-4 py-2 hover:bg-[#222] transition-colors cursor-pointer"
              >
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                )}
                <span className="text-sm text-white">{user.displayName}</span>
                <i className="fa-solid fa-chevron-down text-xs text-[var(--muted-foreground)]" />
              </button>

              {/* Mobile: avatar only (tappable to logout) */}
              <button
                onClick={logout}
                className="sm:hidden flex items-center"
              >
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                )}
              </button>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden ml-1 p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Menu"
              >
                {mobileOpen ? (
                  <i className="fa-solid fa-xmark text-xl" />
                ) : (
                  <i className="fa-solid fa-bars text-xl" />
                )}
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

      {/* Mobile nav dropdown */}
      {user && mobileOpen && (
        <div className="lg:hidden border-t border-[#333] bg-[#242424] px-4 py-3">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-l-3 border-[var(--primary)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[#1a1a1a] hover:text-[var(--foreground)]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Sync progress banner */}
      {user && syncStatus === 'syncing' && syncProgress && (
        <div className="bg-[#242424] border-b border-[#333] px-4 py-2">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
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
  );
}
