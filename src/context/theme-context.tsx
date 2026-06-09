'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { warnCaught } from '@/lib/safe-log';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('printflow_theme');

      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
        window.document.documentElement.classList.remove('light', 'dark');
        window.document.documentElement.classList.add(stored);
      } else {
        window.localStorage.setItem('printflow_theme', 'light');
        window.document.documentElement.classList.remove('light', 'dark');
        window.document.documentElement.classList.add('light');
      }
    } catch (error) {
      warnCaught('Erro capturado:', error);
    } finally {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    try {
      window.document.documentElement.classList.remove('light', 'dark');
      window.document.documentElement.classList.add(theme);
      window.localStorage.setItem('printflow_theme', theme);
    } catch (error) {
      warnCaught('Erro capturado:', error);
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}