import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import { useTranslation } from 'react-i18next';
import { getDailyApiUsage, DAILY_LIMIT } from '../services/steam-api';
import { exportDb, resetDb } from '../db/index';
import * as queries from '../db/queries';
import { Logo } from './Logo';

const navIcons: Record<string, string> = {
  '/discover': 'fa-solid fa-compass',
  '/recommendations': 'fa-solid fa-wand-magic-sparkles',
  '/lists': 'fa-solid fa-layer-group',
  '/history': 'fa-solid fa-clock-rotate-left',
  '/backlog': 'fa-solid fa-bookmark',
  '/chat': 'fa-solid fa-comments',
  '/cauldron': 'fa-solid fa-flask',
  '/filters': 'fa-solid fa-sliders',
  '/stats': 'fa-solid fa-chart-pie',
  '/profile': 'fa-solid fa-user',
  '/settings': 'fa-solid fa-gear',
  '/help': 'fa-solid fa-circle-question',
};

export default function Navbar() {
  const { user, loading, login, syncStatus, syncProgress } = useAuth();
  const { userId } = useDb();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { t } = useTranslation();

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await resetDb();
      window.location.href = '/';
    } catch {
      setSigningOut(false);
    }
  }, []);

  const handleExportDb = useCallback(() => {
    try {
      const data = exportDb();
      const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamedna-backup-${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }, []);

  const handleExportJson = useCallback(() => {
    if (!userId) return;
    try {
      const data = queries.exportUserData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamedna-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }, [userId]);

  const navLinks = [
    { to: '/discover', label: t('nav.discovery') },
    { to: '/recommendations', label: t('nav.recommendations') },
    { to: '/cauldron', label: t('nav.cauldron') },
    { to: '/lists', label: t('nav.myLists') },
    { to: '/history', label: t('nav.history') },
    { to: '/backlog', label: t('nav.backlog') },
    { to: '/chat', label: t('nav.chat') },
    { to: '/filters', label: t('nav.filters') },
    { to: '/stats', label: t('nav.stats') },
    { to: '/profile', label: t('nav.profile') },
    { to: '/settings', label: t('nav.settings') },
    { to: '/help', label: t('nav.help') },
  ];

  // API quota tracking — poll every 10s and on route changes
  const [apiUsage, setApiUsage] = useState(() => getDailyApiUsage());

  const refreshUsage = useCallback(() => setApiUsage(getDailyApiUsage()), []);

  useEffect(() => {
    refreshUsage();
    const id = setInterval(refreshUsage, 10_000);
    // Schedule reset at midnight
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const midnightTimeout = setTimeout(refreshUsage, msUntilMidnight + 100);
    return () => { clearInterval(id); clearTimeout(midnightTimeout); };
  }, [refreshUsage]);

  useEffect(() => { refreshUsage(); }, [location.pathname, refreshUsage]);

  const quotaPercent = Math.min(100, (apiUsage.count / DAILY_LIMIT) * 100);
  const quotaColor = quotaPercent >= 90 ? 'bg-red-500' : quotaPercent >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  const quotaTextColor = quotaPercent >= 90 ? 'text-red-400' : quotaPercent >= 70 ? 'text-yellow-400' : 'text-[var(--muted-foreground)]';

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Lock body scroll when sidebar is open (mobile only)
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
      {/* ─── Desktop: Fixed left sidebar ─── */}
      {user && (
        <aside className="hidden xl:flex fixed top-0 left-0 h-screen w-64 bg-[var(--background)] border-r border-[var(--border)] flex-col z-40">
          {/* Drag region (traffic-light safe zone) */}
          <div className="h-[var(--tauri-titlebar-inset,0px)] shrink-0 w-full" data-tauri-drag-region />
          {/* Logo */}
          <div className="px-5 h-16 flex items-center shrink-0 border-b border-[var(--border)]" data-tauri-drag-region>
            <Link to="/">
              <Logo />
            </Link>
          </div>

          {/* Nav links */}
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to;
              const icon = navIcons[link.to];
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                    isActive
                      ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                      : 'text-[var(--muted-foreground)] hover:bg-white/5 hover:text-[var(--foreground)]'
                  }`}
                >
                  {icon && <i className={`${icon} w-5 text-center text-base`} />}
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Sync progress */}
          {syncStatus === 'syncing' && syncProgress && (
            <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--foreground)] truncate">{syncProgress.detail}</span>
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
          )}

          {/* API quota */}
          <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">{t('common.apiQuota')}</span>
              <span className={`text-[10px] font-medium ${quotaTextColor}`}>
                {quotaPercent.toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
              <div
                className={`h-full ${quotaColor} rounded-full transition-all duration-500`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
            <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
              {t('common.apiCalls', { used: apiUsage.count.toLocaleString(), total: DAILY_LIMIT.toLocaleString() })}
            </p>
          </div>

          {/* User info + logout */}
          <div className="px-3 py-4 border-t border-[var(--border)] shrink-0">
            <div className="flex items-center gap-3 px-3 mb-3">
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-9 h-9 rounded-full" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.displayName}</p>
                <p className="text-xs text-[var(--muted-foreground)]">Steam</p>
              </div>
            </div>
            <button
              onClick={() => setSignOutOpen(true)}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
            >
              <i className="fa-solid fa-right-from-bracket w-5 text-center text-base" />
              {t('common.signOut')}
            </button>
          </div>
        </aside>
      )}

      {/* ─── Mobile/Tablet: Top bar ─── */}
      <nav className="xl:hidden sticky top-0 z-40 bg-[var(--card)]/95 backdrop-blur-lg border-b border-[var(--border)]">
        <div className="px-4 sm:px-6 flex items-center justify-between h-16 mt-[var(--tauri-titlebar-inset,0px)]" data-tauri-drag-region>
          {/* Left: Hamburger + Logo */}
          <div className="flex items-center gap-2">
            {user && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Menu"
              >
                <i className="fa-solid fa-bars text-xl" />
              </button>
            )}
            <Link to="/" className="shrink-0">
              <Logo />
            </Link>
          </div>

          {/* Right: Auth */}
          <div className="flex items-center gap-3">
            {loading ? null : user ? (
              <div className="flex items-center gap-2">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                )}
              </div>
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
          <div className="bg-[var(--card)] border-t border-[var(--border)] px-4 py-2">
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
        )}
      </nav>

      {/* ─── Mobile/Tablet: Slide-out sidebar overlay ─── */}
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
            className={`absolute top-0 left-0 h-full w-72 bg-[var(--background)] border-r border-[var(--border)] flex flex-col transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            {/* Sidebar header */}
            <div className="pt-[var(--tauri-titlebar-inset,0px)] shrink-0" />
            <div className="flex items-center justify-between px-5 h-16 border-b border-[var(--border)] shrink-0">
              <Link to="/" onClick={() => setSidebarOpen(false)}>
                <Logo />
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Close menu"
              >
                <i className="fa-solid fa-xmark text-xl" />
              </button>
            </div>

            {/* User info */}
            <div className="px-5 py-4 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-3">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.displayName}</p>
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
                        : 'text-[var(--muted-foreground)] hover:bg-white/5 hover:text-[var(--foreground)]'
                    }`}
                  >
                    {icon && <i className={`${icon} w-5 text-center text-base`} />}
                    {link.label}
                  </Link>
                );
              })}
            </div>

            {/* API quota */}
            <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">{t('common.apiQuota')}</span>
                <span className={`text-[10px] font-medium ${quotaTextColor}`}>
                  {quotaPercent.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className={`h-full ${quotaColor} rounded-full transition-all duration-500`}
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                {t('common.apiCalls', { used: apiUsage.count.toLocaleString(), total: DAILY_LIMIT.toLocaleString() })}
              </p>
            </div>

            {/* Logout button at bottom */}
            <div className="px-3 py-4 border-t border-[var(--border)] shrink-0">
              <button
                onClick={() => { setSidebarOpen(false); setSignOutOpen(true); }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
              >
                <i className="fa-solid fa-right-from-bracket w-5 text-center text-base" />
                {t('common.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sign Out confirmation dialog ─── */}
      {signOutOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-triangle-exclamation text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-[var(--foreground)]">Sign out of GameDNA?</h3>
            </div>

            <p className="text-sm text-[var(--text-muted)] mb-4">
              All local data will be <span className="text-red-400 font-medium">permanently deleted</span>, including your library, ratings, taste profile, and settings.
            </p>

            <div className="bg-[var(--background)] rounded-xl p-4 mb-6">
              <p className="text-sm font-medium text-[var(--text-body)] mb-3">Export your data first:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportDb}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--muted)] text-[var(--text-body)] rounded-lg text-sm font-medium hover:border-[var(--primary)] hover:text-[var(--foreground)] transition-colors"
                >
                  <i className="fa-solid fa-database text-xs" />
                  Download .db backup
                </button>
                <button
                  onClick={handleExportJson}
                  disabled={!userId}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--muted)] text-[var(--text-body)] rounded-lg text-sm font-medium hover:border-[var(--primary)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                >
                  <i className="fa-solid fa-file-export text-xs" />
                  Download .json export
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSignOutOpen(false)}
                disabled={signingOut}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-[var(--text-body)] border border-[var(--muted)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="px-4 py-2.5 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {signingOut ? (
                  <span className="flex items-center gap-2">
                    <i className="fa-solid fa-spinner fa-spin" />
                    Signing out...
                  </span>
                ) : (
                  'Sign Out'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
