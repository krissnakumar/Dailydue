import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useDailyDueStore } from '../src/store';
import { useTheme } from '../src/theme';

const ENTRY_MS = 420;
const HOLD_MS = 950;
const EXIT_MS = 320;

export default function WelcomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user } = useDailyDueStore();

  const welcomeOpacity = useSharedValue(0);
  const welcomeTranslateY = useSharedValue(20);
  const checkScale = useSharedValue(0);
  const pageOpacity = useSharedValue(1);

  useEffect(() => {
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    // Start entry animations
    welcomeOpacity.value = withTiming(1, { duration: ENTRY_MS, easing: Easing.out(Easing.cubic) });
    welcomeTranslateY.value = withTiming(0, { duration: ENTRY_MS, easing: Easing.out(Easing.cubic) });
    checkScale.value = withDelay(
      150,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.back(1.4)) })
    );

    // Hold briefly, then fade out before routing to dashboard.
    const exitTimer = setTimeout(() => {
      pageOpacity.value = withTiming(0, { duration: EXIT_MS, easing: Easing.inOut(Easing.quad) });
      welcomeOpacity.value = withTiming(0, { duration: EXIT_MS, easing: Easing.inOut(Easing.quad) });
      welcomeTranslateY.value = withTiming(-8, { duration: EXIT_MS, easing: Easing.inOut(Easing.quad) });
      checkScale.value = withTiming(0.92, { duration: EXIT_MS, easing: Easing.inOut(Easing.quad) });
    }, HOLD_MS);
    const routeTimer = setTimeout(() => {
      const state = useDailyDueStore.getState();
      if (state.user && state.user.id !== 'usr_offline' && !state.hasBootstrappedProfile) {
        router.replace('/(onboarding)');
      } else {
        router.replace('/(tabs)/home');
      }
    }, HOLD_MS + EXIT_MS);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(routeTimer);
    };
  }, [checkScale, pageOpacity, router, user, welcomeOpacity, welcomeTranslateY]);

  const animatedWelcomeStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
    transform: [{ translateY: welcomeTranslateY.value }],
  }));

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const animatedPageStyle = useAnimatedStyle(() => ({
    opacity: pageOpacity.value,
  }));

  const { t } = useTranslation();

  // Extract first name or use fallback
  const fullName = user?.full_name || '';
  const firstName = fullName ? fullName.trim().split(' ')[0] : t('common.user');
  const greeting = fullName ? `${t('welcome.greeting')}, ${firstName}!` : t('welcome.back');

  return (
    <Animated.View style={[styles.container, animatedPageStyle]}>
      <View style={styles.content}>
        {/* Animated Checkmark Circle */}
        <Animated.View style={[styles.circle, animatedCheckStyle]}>
          <Animated.Text style={styles.checkIcon}>✓</Animated.Text>
        </Animated.View>

        {/* Animated Greeting Text */}
        <Animated.View style={[styles.textContainer, animatedWelcomeStyle]}>
          <Animated.Text style={styles.title}>{greeting}</Animated.Text>
          <Animated.Text style={styles.subtitle}>
            {t('welcome.ready')}
          </Animated.Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primaryBrand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    ...theme.shadows.lg,
  },
  checkIcon: {
    fontSize: 40,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: 'Outfit',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
    textAlign: 'center',
  },
});
