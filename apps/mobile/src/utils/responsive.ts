import { Platform, useColorScheme, useWindowDimensions } from 'react-native';
import { useMemo } from 'react';
import { theme } from '../theme';

export const breakpoints = {
  xs: 0,
  sm: 360,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type Breakpoint = keyof typeof breakpoints;

export type ResponsiveLayout = {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSmallScreen: boolean;
  isLandscape: boolean;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    screen: number;
    section: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    title: number;
    hero: number;
  };
  cardWidth: number | string;
  gridColumns: number;
  contentMaxWidth: number;
  formMaxWidth: number;
  sidebarWidth: number;
  rightPanelWidth: number;
};

export const getBreakpoint = (width: number): Breakpoint => {
  if (width >= breakpoints.xl) return 'xl';
  if (width >= breakpoints.lg) return 'lg';
  if (width >= breakpoints.md) return 'md';
  if (width >= breakpoints.sm) return 'sm';
  return 'xs';
};

export const getGridColumns = (width: number) => {
  if (width >= breakpoints.xl) return 4;
  if (width >= breakpoints.lg) return 3;
  if (width >= breakpoints.md) return 2;
  return 1;
};

export const getCardWidth = (width: number) => {
  if (width >= breakpoints.xl) return 280;
  if (width >= breakpoints.lg) return 300;
  if (width >= breakpoints.md) return '48%';
  return '100%';
};

export const getResponsiveLayout = (width: number, height: number): ResponsiveLayout => {
  const breakpoint = getBreakpoint(width);
  const isDesktop = width >= breakpoints.lg || Platform.OS === 'web';
  const isTablet = width >= breakpoints.md && width < breakpoints.lg;
  const isPhone = width < breakpoints.md;
  const isSmallScreen = width < breakpoints.sm;
  const gridColumns = getGridColumns(width);

  return {
    width,
    height,
    breakpoint,
    isPhone,
    isTablet,
    isDesktop,
    isSmallScreen,
    isLandscape: width > height,
    spacing: {
      xs: isSmallScreen ? 4 : 6,
      sm: isSmallScreen ? 8 : 10,
      md: isSmallScreen ? 12 : 16,
      lg: isPhone ? 20 : 24,
      xl: isPhone ? 24 : 32,
      screen: isSmallScreen ? 12 : isPhone ? 16 : 24,
      section: isPhone ? 18 : 24,
    },
    radius: {
      sm: theme.borderRadius.sm,
      md: theme.borderRadius.md,
      lg: theme.borderRadius.lg,
      xl: 24,
      full: theme.borderRadius.full,
    },
    fontSize: {
      xs: isSmallScreen ? 11 : 12,
      sm: isSmallScreen ? 12 : 13,
      md: isSmallScreen ? 14 : 15,
      lg: isSmallScreen ? 16 : 18,
      xl: isSmallScreen ? 20 : 22,
      title: isSmallScreen ? 20 : isPhone ? 22 : 26,
      hero: isSmallScreen ? 26 : isPhone ? 30 : 36,
    },
    cardWidth: getCardWidth(width),
    gridColumns,
    contentMaxWidth: width >= breakpoints.xl ? 1180 : width >= breakpoints.lg ? 1040 : 760,
    formMaxWidth: width >= breakpoints.md ? 620 : width,
    sidebarWidth: width >= breakpoints.xl ? 280 : 240,
    rightPanelWidth: width >= breakpoints.xl ? 320 : 280,
  };
};

export const adaptiveColors = {
  light: {
    background: theme.colors.background,
    surface: theme.colors.card,
    mutedSurface: theme.colors.inputBg,
    text: theme.colors.textMain,
    textMuted: theme.colors.textMuted,
    border: theme.colors.border,
  },
  dark: {
    background: '#0b1220',
    surface: '#111827',
    mutedSurface: '#1f2937',
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    border: '#334155',
  },
} as const;

export const useAdaptiveColors = () => {
  const scheme = useColorScheme();
  return scheme === 'dark' ? adaptiveColors.dark : adaptiveColors.light;
};

export const useResponsive = () => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => getResponsiveLayout(width, height), [height, width]);
};

export const useResponsiveValue = <T,>(values: Partial<Record<Breakpoint | 'base', T>>) => {
  const layout = useResponsive();

  return useMemo(() => {
    if (values[layout.breakpoint] !== undefined) return values[layout.breakpoint] as T;
    if (layout.width >= breakpoints.xl && values.lg !== undefined) return values.lg as T;
    if (layout.width >= breakpoints.lg && values.md !== undefined) return values.md as T;
    if (layout.width >= breakpoints.md && values.sm !== undefined) return values.sm as T;
    return values.base as T;
  }, [layout.breakpoint, layout.width, values]);
};
