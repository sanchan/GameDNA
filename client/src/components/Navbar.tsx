import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../hooks/use-auth';

const navLinks = [
  { to: '/discover', label: 'Discover' },
  { to: '/recommendations', label: 'For You' },
  { to: '/backlog', label: 'Backlog' },
  { to: '/profile', label: 'Profile' },
];

export default function Navbar() {
  const { user, loading, login, logout, syncStatus } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-40">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
        <Link to="/" className="text-lg font-bold text-[var(--primary)]">
          GameDNA
        </Link>

        {/* Desktop nav */}
        {user && (
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm transition-colors ${
                  location.pathname === link.to
                    ? 'text-[var(--foreground)] font-medium'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <>
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
              )}
              <span className="text-sm hidden sm:inline">{user.displayName}</span>
              <button onClick={logout} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                Logout
              </button>
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden ml-2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label="Menu"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  {mobileOpen ? (
                    <path d="M4 4L16 16M16 4L4 16" />
                  ) : (
                    <path d="M3 5H17M3 10H17M3 15H17" />
                  )}
                </svg>
              </button>
            </>
          ) : (
            <button onClick={login} className="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-1.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
              Sign in with Steam
            </button>
          )}
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {user && mobileOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--card)] px-4 py-2">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block py-2 text-sm ${
                location.pathname === link.to
                  ? 'text-[var(--foreground)] font-medium'
                  : 'text-[var(--muted-foreground)]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
      {/* Sync status banner */}
      {user && syncStatus === 'syncing' && (
        <div className="bg-[var(--primary)] text-[var(--primary-foreground)] text-center py-1.5 text-sm">
          <span className="inline-block animate-pulse">Syncing your Steam library...</span>
        </div>
      )}
    </nav>
  );
}
