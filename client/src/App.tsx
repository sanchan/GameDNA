import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { DbProvider, useDb } from './contexts/db-context';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import { ThemeContext, useThemeProvider } from './hooks/use-theme';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useAuth } from './hooks/use-auth';
import { useAi } from './hooks/use-ai';
import Landing from './pages/Landing';
import Discovery from './pages/Discovery';
import Backlog from './pages/Backlog';
import GameDetail from './pages/GameDetail';
import Profile from './pages/Profile';
import Recommendations from './pages/Recommendations';
import History from './pages/History';
import MyLists from './pages/MyLists';
import Settings from './pages/Settings';
import Stats from './pages/Stats';
import Chat from './pages/Chat';
import Legal from './pages/Legal';
import Filters from './pages/Filters';
import Help from './pages/Help';
import HelpMatch from './pages/HelpMatch';
import HelpPrivacy from './pages/HelpPrivacy';
import Onboarding from './pages/Onboarding';

function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <>{children}</>;
}

function DbGate({ children }: { children: React.ReactNode }) {
  const { status, error, config } = useDb();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted)]">Loading database...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">Database Error</h2>
          <p className="text-[var(--muted)]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Initialize the AI engine once at app startup based on saved config. */
function AiInit() {
  useAi();
  return null;
}

function AppRoutes() {
  const { config } = useDb();
  const isSetup = config?.setupComplete;

  return (
    <Routes>
      <Route path="/onboarding" element={isSetup ? <Navigate to="/" replace /> : <Onboarding />} />
      <Route path="/legal" element={<Legal />} />
      {!isSetup ? (
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      ) : (
        <>
          <Route path="/" element={<Landing />} />
          <Route path="/discover" element={<Discovery />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/game/:appid" element={<GameDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/history" element={<History />} />
          <Route path="/lists" element={<MyLists />} />
          <Route path="/filters" element={<Filters />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/help" element={<Help />} />
          <Route path="/help/match" element={<HelpMatch />} />
          <Route path="/help/privacy" element={<HelpPrivacy />} />
        </>
      )}
    </Routes>
  );
}

export default function App() {
  const themeCtx = useThemeProvider();

  return (
    <ErrorBoundary>
      <ThemeContext.Provider value={themeCtx}>
        <BrowserRouter>
          <DbProvider>
            <ToastProvider>
              <KeyboardShortcutsProvider>
                <DbGate>
                  <AiInit />
                  <div className="min-h-screen bg-[var(--background)]">
                    <a href="#main-content" className="skip-to-content">
                      Skip to content
                    </a>
                    <AppNavbar />
                    <AppMain />
                  </div>
                </DbGate>
              </KeyboardShortcutsProvider>
            </ToastProvider>
          </DbProvider>
        </BrowserRouter>
      </ThemeContext.Provider>
    </ErrorBoundary>
  );
}

function AppNavbar() {
  const { config } = useDb();
  // Only show navbar after setup is complete
  if (!config?.setupComplete) return null;
  return <Navbar />;
}

function AppMain() {
  const { config } = useDb();
  const { user } = useAuth();
  const hasSidebar = config?.setupComplete && user;
  return (
    <main id="main-content" className={hasSidebar ? 'xl:ml-64' : ''}>
      <AppRoutes />
    </main>
  );
}
