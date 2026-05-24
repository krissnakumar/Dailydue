import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { useAdaptiveColors } from '../utils/responsive';

export interface CardProps extends ViewProps {
  children: React.ReactNode;
  variant?: 'default' | 'highlight' | 'status';
  statusColor?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
  statusColor,
  ...props
}) => {
  const colors = useAdaptiveColors();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        variant === 'highlight' && styles.highlight,
        statusColor ? { borderLeftWidth: 4, borderLeftColor: statusColor } : null,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  highlight: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
});
