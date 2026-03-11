import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">Something went wrong</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
            >
              Reload
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
