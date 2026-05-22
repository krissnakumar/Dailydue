import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { LogBox } from 'react-native';
import { useFiadoStore } from '../src/store';
import { supabase } from '@controle-fiado/api';

LogBox.ignoreLogs([
  'Network request failed',
  'Failed to fetch',
  '[TypeError: Network request failed]',
  'TypeError: Network request failed',
  'Invalid Refresh Token',
  'AuthApiError'
]);

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
  const { user, attemptBackgroundSync, setUser, refreshCustomerPictureUrls, loadSupabaseData } = useFiadoStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  // Track whether the root layout has completed its first render.
  // Expo Router can fire auth effects before the Stack navigator is
  // fully mounted, causing "navigate before mounting" errors.
  const mounted = useRef(false);
  const [authChecked, setAuthChecked] = React.useState(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Tenta sincronizar a fila offline ao inicializar o app
    attemptBackgroundSync();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      useFiadoStore.setState({ customers: [], syncQueue: [] });
      return;
    }
    if (user.id === 'usr_offline') return;
    
    refreshCustomerPictureUrls();
    loadSupabaseData();
  }, [user?.id, refreshCustomerPictureUrls, loadSupabaseData]);

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
          picture: (sess.user.user_metadata as any)?.picture || (sess.user.user_metadata as any)?.avatar_url || undefined,
        });
      })
      .catch((error) => {
        console.warn('Failed to get Supabase session (network or DB down):', error);
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
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
        full_name:
          (sess.user.user_metadata as any)?.full_name ||
          (sess.user.user_metadata as any)?.name ||
          undefined,
        picture: (sess.user.user_metadata as any)?.picture || (sess.user.user_metadata as any)?.avatar_url || undefined,
      });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setUser]);

  useEffect(() => {
    if (splashHidden.current) return;
    if (authChecked && navigationState?.key) {
      splashHidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [navigationState?.key, authChecked]);

  // Failsafe: hide splash screen unconditionally after 2.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!splashHidden.current) {
        splashHidden.current = true;
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

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
