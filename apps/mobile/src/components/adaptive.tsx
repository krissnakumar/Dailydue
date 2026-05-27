import React, { ReactNode, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ButtonProps } from './Button';
import { theme } from '../theme';
import { useAdaptiveColors, useResponsive } from '../utils/responsive';

type AdaptiveContainerProps = {
  children: ReactNode;
  scroll?: boolean;
  keyboard?: boolean;
  safeArea?: boolean;
  centered?: boolean;
  maxWidth?: number;
  sidebar?: ReactNode;
  rightPanel?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
};

export const AdaptiveContainer = ({
  children,
  scroll = true,
  keyboard = false,
  safeArea = true,
  centered = true,
  maxWidth,
  sidebar,
  rightPanel,
  contentContainerStyle,
  style,
  scrollProps,
}: AdaptiveContainerProps) => {
  const layout = useResponsive();
  const colors = useAdaptiveColors();
  const insets = useSafeAreaInsets();
  const showSidebar = Boolean(sidebar) && layout.isDesktop;
  const showRightPanel = Boolean(rightPanel) && layout.width >= 1180;

  const contentStyle = useMemo(
    () => [
      styles.content,
      {
        paddingHorizontal: layout.spacing.screen,
        paddingVertical: layout.spacing.md,
        paddingBottom: layout.spacing.xl + (safeArea ? insets.bottom : 0),
        maxWidth: maxWidth ?? layout.contentMaxWidth,
      },
      centered && styles.centered,
      contentContainerStyle,
    ],
    [centered, contentContainerStyle, insets.bottom, layout.contentMaxWidth, layout.spacing, maxWidth, safeArea]
  );

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={contentStyle}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={contentStyle}>{children}</View>
  );

  const framedBody = (
    <View style={[styles.shell, { backgroundColor: colors.background }, style]}>
      {showSidebar ? <View style={[styles.sidebar, { width: layout.sidebarWidth }]}>{sidebar}</View> : null}
      <View style={styles.main}>{body}</View>
      {showRightPanel ? <View style={[styles.rightPanel, { width: layout.rightPanelWidth }]}>{rightPanel}</View> : null}
    </View>
  );

  const keyboardBody = keyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
    >
      {framedBody}
    </KeyboardAvoidingView>
  ) : (
    framedBody
  );

  if (!safeArea) return keyboardBody;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
      {keyboardBody}
    </SafeAreaView>
  );
};

type AdaptiveGridProps = {
  children: ReactNode;
  minItemWidth?: number;
  maxColumns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

export const AdaptiveGrid = ({ children, minItemWidth = 220, maxColumns, gap, style }: AdaptiveGridProps) => {
  const layout = useResponsive();
  const items = React.Children.toArray(children).filter(Boolean);
  const resolvedGap = gap ?? layout.spacing.md;
  const columns = Math.max(
    1,
    Math.min(maxColumns ?? layout.gridColumns, Math.floor((layout.width - layout.spacing.screen * 2) / minItemWidth))
  );
  const itemWidth = `${100 / columns}%` as const;

  return (
    <View style={[styles.grid, { marginHorizontal: -resolvedGap / 2 }, style]}>
      {items.map((child, index) => (
        <View key={index} style={{ width: itemWidth, paddingHorizontal: resolvedGap / 2, marginBottom: resolvedGap }}>
          {child}
        </View>
      ))}
    </View>
  );
};

type AdaptiveCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: TouchableOpacityProps['onPress'];
  accentColor?: string;
};

export const AdaptiveCard = ({ children, style, onPress, accentColor }: AdaptiveCardProps) => {
  const colors = useAdaptiveColors();
  const layout = useResponsive();
  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: layout.radius.md,
      padding: layout.spacing.md,
    },
    accentColor ? { borderTopWidth: 3, borderTopColor: accentColor } : null,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

type ResponsiveTextProps = TextProps & {
  variant?: 'caption' | 'body' | 'label' | 'title' | 'hero';
  muted?: boolean;
};

export const ResponsiveText = ({ variant = 'body', muted = false, style, children, ...props }: ResponsiveTextProps) => {
  const colors = useAdaptiveColors();
  const layout = useResponsive();
  const size =
    variant === 'caption'
      ? layout.fontSize.xs
      : variant === 'label'
      ? layout.fontSize.sm
      : variant === 'title'
      ? layout.fontSize.title
      : variant === 'hero'
      ? layout.fontSize.hero
      : layout.fontSize.md;

  return (
    <Text
      style={[
        { color: muted ? colors.textMuted : colors.text, fontSize: size },
        variant === 'title' || variant === 'hero' ? styles.textStrong : null,
        variant === 'label' ? styles.textLabel : null,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

export const ResponsiveButton = ({ style, size = 'md', ...props }: ButtonProps) => {
  const layout = useResponsive();

  return (
    <Button
      size={size}
      style={[{ minHeight: 44, borderRadius: layout.radius.md }, layout.isSmallScreen && { paddingHorizontal: 12 }, style]}
      {...props}
    />
  );
};

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const ScreenHeader = ({ title, subtitle, action, style }: ScreenHeaderProps) => {
  const layout = useResponsive();

  return (
    <View style={[styles.screenHeader, { marginBottom: layout.spacing.md }, style]}>
      <View style={styles.screenHeaderText}>
        <ResponsiveText variant="title" numberOfLines={2}>
          {title}
        </ResponsiveText>
        {subtitle ? (
          <ResponsiveText variant="body" muted style={styles.headerSubtitle}>
            {subtitle}
          </ResponsiveText>
        ) : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shell: {
    flex: 1,
    flexDirection: 'row',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  sidebar: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  rightPanel: {
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  content: {
    flexGrow: 1,
    width: '100%',
  },
  centered: {
    alignSelf: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  textStrong: {
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  textLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  headerSubtitle: {
    marginTop: 4,
  },
  headerAction: {
    marginLeft: 12,
  },
});
