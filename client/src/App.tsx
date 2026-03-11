import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './hooks/use-auth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Discovery from './pages/Discovery';
import Backlog from './pages/Backlog';
import GameDetail from './pages/GameDetail';
import Profile from './pages/Profile';
import Recommendations from './pages/Recommendations';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <div className="min-h-screen bg-[var(--background)]">
              <Navbar />
              <main>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/discover" element={<Discovery />} />
                  <Route path="/backlog" element={<Backlog />} />
                  <Route path="/game/:appid" element={<GameDetail />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/recommendations" element={<Recommendations />} />
                </Routes>
              </main>
            </div>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
