import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFiadoStore } from '../src/store';
import { supabase } from '@controle-fiado/api';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutos
    },
  },
});

export default function RootLayout() {
  const { user, attemptBackgroundSync, setUser, refreshCustomerPictureUrls } = useFiadoStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  // Track whether the root layout has completed its first render.
  // Expo Router can fire auth effects before the Stack navigator is
  // fully mounted, causing "navigate before mounting" errors.
  const mounted = useRef(false);
  const authChecked = useRef(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Tenta sincronizar a fila offline ao inicializar o app
    attemptBackgroundSync();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (user.id === 'usr_offline') return;
    refreshCustomerPictureUrls();
  }, [user?.id, refreshCustomerPictureUrls]);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        const sess = data.session;
        if (!sess) {
          setUser(null);
          return;
        }
        setUser({
          id: sess.user.id,
          email: sess.user.email || undefined,
          full_name:
            (sess.user.user_metadata as any)?.full_name ||
            (sess.user.user_metadata as any)?.name ||
            undefined,
        });
      })
      .finally(() => {
        authChecked.current = true;
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!active) return;
      if (!sess) {
        setUser(null);
        return;
      }
      setUser({
        id: sess.user.id,
        email: sess.user.email || undefined,
        full_name: (sess.user.user_metadata as any)?.full_name || (sess.user.user_metadata as any)?.name || undefined,
      });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setUser]);

  useEffect(() => {
    if (splashHidden.current) return;
    if (!navigationState?.key) return;
    if (!authChecked.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [navigationState?.key]);

  useEffect(() => {
    // Wait until both the navigator state is ready AND the layout is mounted
    if (!mounted.current || !navigationState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';

    const timeoutId = setTimeout(() => {
      if (!user && !inAuthGroup) {
        router.replace('/(auth)/login');
      } else if (user && inAuthGroup) {
        router.replace('/(tabs)/home');
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [user, segments, navigationState?.key]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" backgroundColor="#064e3b" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
