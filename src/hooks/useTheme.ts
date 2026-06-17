'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  // Start with 'dark' to match the server render / default theme and avoid hydration mismatch
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Sync with what the blocking script set in the DOM
    const current = (document.documentElement.dataset.theme as Theme) || 'dark';
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    setTheme(next);
  }, [theme]);

  return { theme, toggle, mounted } as const;
}
