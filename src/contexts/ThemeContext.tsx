import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'lexu_theme';
const USER_CHOICE_KEY = 'lexu_theme_user_choice';

const applyThemeClass = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  if (!root) return;
  if (mode === 'dark') {
    root.classList.add('theme-dark');
    body?.classList.add('theme-dark');
  } else {
    root.classList.remove('theme-dark');
    body?.classList.remove('theme-dark');
  }
};

function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  const hasChoice = localStorage.getItem(USER_CHOICE_KEY) === '1';
  if (hasChoice && (stored === 'light' || stored === 'dark')) return stored;
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initialMode = getStoredMode();

  // Appliquer immédiatement la classe pour éviter tout flash blanc avant le premier render
  applyThemeClass(initialMode);

  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const resolved: 'light' | 'dark' = useMemo(() => mode, [mode]);

  // Apply the CSS class that drives theme variables. We update html AND body to
  // guard against any stale class left behind by HMR or external scripts.
  useEffect(() => {
    applyThemeClass(resolved);
  }, [resolved]);

  const setModeWithFlag = (next: ThemeMode) => {
    setMode(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.setItem(USER_CHOICE_KEY, '1');
    }
  };

  const value: ThemeContextValue = {
    mode,
    resolved,
    setMode: setModeWithFlag,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

