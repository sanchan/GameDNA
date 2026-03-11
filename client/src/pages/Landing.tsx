import { useAuth } from '../hooks/use-auth';
import { Navigate } from 'react-router';

export default function Landing() {
  const { user, loading, login } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/discover" />;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
      <h1 className="text-5xl font-bold mb-4">
        <span className="text-[var(--primary)]">Game</span>DNA
      </h1>
      <p className="text-xl text-[var(--muted-foreground)] mb-2 text-center max-w-lg">
        Discover your next favorite game through AI-powered recommendations
      </p>
      <p className="text-[var(--muted-foreground)] mb-8 text-center max-w-md">
        Swipe through games, build your gaming profile, and get personalized recommendations powered by your taste and local AI.
      </p>
      <button
        onClick={login}
        className="bg-[var(--primary)] text-[var(--primary-foreground)] px-8 py-3 rounded-lg text-lg font-semibold hover:opacity-90 transition-opacity"
      >
        Sign in with Steam
      </button>
    </div>
  );
}
