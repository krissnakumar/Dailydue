/**
 * Theme System — Full Dark & Light Palettes with React Context
 *
 * Usage:
 *   import { useTheme } from '../theme';
 *   const { theme, colorScheme } = useTheme();
 *   // theme.colors.background, theme.borderRadius.md, etc.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useDailyDueStore } from '../store';

// ─── Type ────────────────────────────────────────────────────────────────

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    primaryBrand: string;
    accent: string;
    accentLight: string;
    payment: string;
    whatsapp: string;

    // Backgrounds & Surfaces
    background: string;
    card: string;
    textMain: string;
    textMuted: string;
    border: string;
    inputBg: string;
    tabBarBg: string;
    tabBarBorder: string;
    centerButtonBg: string;

    // Status
    success: string;
    successBg: string;
    successText: string;
    warning: string;
    warningBg: string;
    warningText: string;
    danger: string;
    dangerBg: string;
    dangerText: string;
    infoBg: string;
    infoText: string;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  shadows: {
    sm: object;
    md: object;
    lg: object;
    modal: object;
  };
}

// ─── Palettes ────────────────────────────────────────────────────────────

const lightTheme: Theme = {
  colors: {
    primary: '#059669',
    primaryLight: '#10b981',
    primaryDark: '#047857',
    primaryBrand: '#064e3b',
    accent: '#ea580c',
    accentLight: '#f97316',
    payment: '#2563eb',
    whatsapp: '#25d366',

    // Backgrounds & Surfaces
    background: '#f8fafc',
    card: '#ffffff',
    textMain: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    inputBg: '#f1f5f9',
    tabBarBg: '#ffffff',
    tabBarBorder: '#e2e8f0',
    centerButtonBg: '#ffffff',

    // Status
    success: '#10b981',
    successBg: '#d1fae5',
    successText: '#065f46',
    warning: '#f59e0b',
    warningBg: '#fef9c3',
    warningText: '#854d0e',
    danger: '#ef4444',
    dangerBg: '#fee2e2',
    dangerText: '#991b1b',
    infoBg: '#e0f2fe',
    infoText: '#0369a1',
  },
  borderRadius: {
    sm: 8,
    md: 14,
    lg: 20,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 25,
      elevation: 6,
    },
    modal: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.12,
      shadowRadius: 30,
      elevation: 10,
    },
  },
} as const;

const darkTheme: Theme = {
  colors: {
    primary: '#059669',
    primaryLight: '#10b981',
    primaryDark: '#047857',
    primaryBrand: '#064e3b',
    accent: '#ea580c',
    accentLight: '#f97316',
    payment: '#3b82f6',
    whatsapp: '#25d366',

    // Backgrounds & Surfaces
    background: '#0b1220',
    card: '#111827',
    textMain: '#f1f5f9',
    textMuted: '#94a3b8',
    border: '#1e293b',
    inputBg: '#1e293b',
    tabBarBg: '#0d100e',
    tabBarBorder: '#2d3132',
    centerButtonBg: '#1a1d1b',

    // Status
    success: '#10b981',
    successBg: '#064e3b',
    successText: '#6ee7b7',
    warning: '#f59e0b',
    warningBg: '#422006',
    warningText: '#fbbf24',
    danger: '#ef4444',
    dangerBg: '#450a0a',
    dangerText: '#fca5a5',
    infoBg: '#0c4a6e',
    infoText: '#7dd3fc',
  },
  borderRadius: {
    sm: 8,
    md: 14,
    lg: 20,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.5,
      shadowRadius: 25,
      elevation: 6,
    },
    modal: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.6,
      shadowRadius: 30,
      elevation: 10,
    },
  },
} as const;

// ─── Deprecated static export (for gradual migration) ───────────────────
// Components still importing `theme` directly will get the light theme.
// All new code should use `useTheme()` instead.
/** @deprecated Use useTheme() hook for dynamic theming */
export const theme: Theme = lightTheme;

// ─── Context ─────────────────────────────────────────────────────────────

interface ThemeContextValue {
  theme: Theme;
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
  setColorScheme: (scheme: ColorScheme | 'system') => void;
  resolvedScheme: ColorScheme;
  schemePreference: 'system' | 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  colorScheme: 'light',
  toggleColorScheme: () => {},
  setColorScheme: () => {},
  resolvedScheme: 'light',
  schemePreference: 'system',
});

// ─── Provider ────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const osScheme = useColorScheme() ?? 'light';
  const schemePreference = useDailyDueStore((s) => s.colorScheme);
  const setStoreScheme = useDailyDueStore((s) => s.setColorScheme);

  const resolvedScheme: ColorScheme =
    schemePreference === 'system' ? osScheme : schemePreference;

  const theme = resolvedScheme === 'dark' ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colorScheme: resolvedScheme,
      toggleColorScheme: () => {
        const next: ColorScheme = resolvedScheme === 'dark' ? 'light' : 'dark';
        setStoreScheme(next);
      },
      setColorScheme: (scheme: ColorScheme | 'system') => {
        setStoreScheme(scheme);
      },
      resolvedScheme,
      schemePreference,
    }),
    [resolvedScheme, schemePreference, setStoreScheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback – no provider (e.g. before layout mounts)
    const osScheme = 'light';
    return {
      theme: lightTheme,
      colorScheme: 'light',
      toggleColorScheme: () => {},
      setColorScheme: () => {},
      resolvedScheme: 'light',
      schemePreference: 'system',
    };
  }
  return ctx;
}
