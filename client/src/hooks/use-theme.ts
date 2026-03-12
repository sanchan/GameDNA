import { useState, useEffect, createContext, useContext } from 'react';
import { api } from '../lib/api';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeProvider() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('gamedna-theme') as Theme) || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
      root.style.setProperty('--background', '#f5f5f5');
      root.style.setProperty('--foreground', '#1a1a1a');
      root.style.setProperty('--muted', '#e5e5e5');
      root.style.setProperty('--muted-foreground', '#737373');
    } else {
      root.removeAttribute('data-theme');
      root.style.setProperty('--background', '#1a1a1a');
      root.style.setProperty('--foreground', '#ffffff');
      root.style.setProperty('--muted', '#333333');
      root.style.setProperty('--muted-foreground', '#999999');
    }
    localStorage.setItem('gamedna-theme', theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    // Persist to server if logged in
    api.put('/settings', { theme: newTheme }).catch(() => {});
  };

  return { theme, setTheme };
}
