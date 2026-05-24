import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useFiadoStore } from '../src/store';
import { theme } from '../src/theme';

const ENTRY_MS = 420;
const HOLD_MS = 950;
const EXIT_MS = 320;

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useFiadoStore();

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
      router.replace('/(tabs)/home');
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

  // Extract first name or use fallback
  const fullName = user?.full_name || '';
  const firstName = fullName ? fullName.trim().split(' ')[0] : 'usuário';
  const greeting = fullName ? `Olá, ${firstName}!` : 'Bem-vindo de volta!';

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
            Seu Controle de Fiado está pronto.
          </Animated.Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
