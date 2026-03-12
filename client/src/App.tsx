import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './hooks/use-auth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import { ThemeContext, useThemeProvider } from './hooks/use-theme';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
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

function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <>{children}</>;
}

export default function App() {
  const themeCtx = useThemeProvider();

  return (
    <ErrorBoundary>
      <ThemeContext.Provider value={themeCtx}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <KeyboardShortcutsProvider>
                <div className="min-h-screen bg-[var(--background)]">
                  <a href="#main-content" className="skip-to-content">
                    Skip to content
                  </a>
                  <Navbar />
                  <main id="main-content">
                    <Routes>
                      <Route path="/" element={<Landing />} />
                      <Route path="/discover" element={<Discovery />} />
                      <Route path="/backlog" element={<Backlog />} />
                      <Route path="/game/:appid" element={<GameDetail />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/recommendations" element={<Recommendations />} />
                      <Route path="/history" element={<History />} />
                      <Route path="/lists" element={<MyLists />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/stats" element={<Stats />} />
                      <Route path="/chat" element={<Chat />} />
                    </Routes>
                  </main>
                </div>
              </KeyboardShortcutsProvider>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeContext.Provider>
    </ErrorBoundary>
  );
}
