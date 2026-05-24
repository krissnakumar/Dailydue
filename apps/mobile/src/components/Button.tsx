import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  TouchableOpacityProps,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../theme';

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'accent' | 'success' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  style,
  disabled,
  ...props
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          bg: theme.colors.dangerBg,
          text: theme.colors.danger,
          border: theme.colors.dangerBg,
        };
      case 'accent':
        return {
          bg: theme.colors.accent,
          text: '#ffffff',
          border: theme.colors.accent,
        };
      case 'success':
        return {
          bg: theme.colors.successBg,
          text: theme.colors.primaryDark,
          border: '#a7f3d0',
        };
      case 'secondary':
        return {
          bg: theme.colors.inputBg,
          text: theme.colors.textMain,
          border: theme.colors.border,
        };
      case 'ghost':
        return {
          bg: 'transparent',
          text: theme.colors.primary,
          border: 'transparent',
        };
      case 'primary':
      default:
        return {
          bg: theme.colors.primary,
          text: '#ffffff',
          border: theme.colors.primaryDark,
        };
    }
  };

  const currentVariant = getVariantStyles();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[
        styles.base,
        size === 'lg' ? styles.lg : size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: currentVariant.bg, borderColor: currentVariant.border },
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={currentVariant.text} />
      ) : (
        <>
          {leftIcon}
          <Text
            style={[
              styles.text,
              size === 'lg' ? styles.textLg : size === 'sm' ? styles.textSm : styles.textMd,
              { color: currentVariant.text },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  sm: {
    height: 32,
    paddingHorizontal: 12,
  },
  md: {
    height: 40,
  },
  lg: {
    height: 48,
  },
  text: {
    fontWeight: '700',
    textAlign: 'center',
  },
  textSm: {
    fontSize: 12,
  },
  textMd: {
    fontSize: 14,
  },
  textLg: {
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});
