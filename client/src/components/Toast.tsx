import { useState, useEffect, useCallback, createContext, useContext, createElement, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  toast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return createElement(
    ToastContext.Provider,
    { value: { toast: addToast } },
    children,
    toasts.length > 0 &&
      createElement(
        'div',
        { className: 'fixed bottom-4 right-4 z-50 flex flex-col gap-2' },
        toasts.map((t) =>
          createElement(
            'div',
            {
              key: t.id,
              className: `px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
                t.type === 'success'
                  ? 'bg-emerald-900 text-emerald-100 border border-emerald-700'
                  : t.type === 'error'
                    ? 'bg-red-900 text-red-100 border border-red-700'
                    : 'bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)]'
              }`,
            },
            t.message,
          ),
        ),
      ),
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
