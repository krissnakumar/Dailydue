import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { LogBox } from 'react-native';
import { useFiadoStore } from '../src/store';
import { supabase, extractUserMetadata } from '@controle-fiado/api';

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

const AUTH_SESSION_ACTIVE_KEY = '__fiadoAuthSessionActive';

export default function RootLayout() {
  const {
    user,
    authChecked,
    attemptBackgroundSync,
    setUser,
    setAuthChecked,
    refreshCustomerPictureUrls,
    loadSupabaseData,
  } = useFiadoStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  // Track whether the root layout has completed its first render.
  // Expo Router can fire auth effects before the Stack navigator is
  // fully mounted, causing "navigate before mounting" errors.
  const mounted = useRef(false);
  const splashHidden = useRef(false);
  const handledAuthUrls = useRef(new Set<string>());
  const [pendingAuthNavigation, setPendingAuthNavigation] = useState(false);

  const applySessionUser = React.useCallback(
    (sess: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>) => {
      const meta = extractUserMetadata(sess.user.user_metadata);
      setUser({
        id: sess.user.id,
        email: sess.user.email || undefined,
        full_name: meta.full_name,
        picture: meta.picture,
      });
    },
    [setUser]
  );

  const completeAuthFromUrl = React.useCallback(
    async (url: string | null) => {
      if (!url || handledAuthUrls.current.has(url)) return;
      if ((globalThis as any)[AUTH_SESSION_ACTIVE_KEY]) return;

      const normalizedUrl = url.replace('#', url.includes('?') ? '&' : '?');
      const parsed = Linking.parse(normalizedUrl);
      const isNativeCallback = url.startsWith('controlefiado://');
      const isExpoGoCallback = parsed.path === 'auth/callback' || parsed.path?.endsWith('/--/auth/callback');
      if (!isNativeCallback && !isExpoGoCallback) return;

      const params = (parsed.queryParams || {}) as Record<string, string | string[] | undefined>;
      const readParam = (key: string) => {
        const value = params[key];
        return Array.isArray(value) ? value[0] : value;
      };
      const code = readParam('code');
      const accessToken = readParam('access_token');
      const refreshToken = readParam('refresh_token');
      const authError = readParam('error_description') || readParam('error');

      if (!code && !(accessToken && refreshToken) && !authError) return;
      handledAuthUrls.current.add(url);

      if (authError) {
        console.warn('[Auth] OAuth callback returned an error:', authError);
        return;
      }

      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data.session) {
            applySessionUser(data.session);
            setPendingAuthNavigation(true);
          }
          return;
        }

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (data.session) {
            applySessionUser(data.session);
            setPendingAuthNavigation(true);
          }
        }
      } catch (error) {
        console.warn('[Auth] Failed to complete OAuth callback:', error);
      }
    },
    [applySessionUser]
  );

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
          const currentUser = useFiadoStore.getState().user;
          if (!currentUser) {
            setUser(null);
          }
          return;
        }
        applySessionUser(sess);
      })
      .catch(async (error) => {
        console.warn('Failed to get Supabase session (network or DB down):', error);
        const errStr = String(error);
        if (errStr.includes('Refresh Token') || errStr.includes('refresh_token') || errStr.includes('AuthApiError')) {
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            console.warn('Failed to signOut after invalid refresh token:', signOutErr);
          }
        }
        if (active) {
          const currentUser = useFiadoStore.getState().user;
          if (!currentUser) {
            setUser(null);
          }
        }
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
      applySessionUser(sess);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setUser, applySessionUser]);

  useEffect(() => {
    Linking.getInitialURL().then(completeAuthFromUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      completeAuthFromUrl(url);
    });
    return () => sub.remove();
  }, [completeAuthFromUrl]);

  useEffect(() => {
    if (splashHidden.current) return;
    // Hide the native splash as soon as the navigator is ready.
    // We'll handle any auth loading state inside the app UI.
    if (navigationState?.key) {
      splashHidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [navigationState?.key]);

  // Failsafe: hide splash screen unconditionally after 1 second
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!splashHidden.current) {
        splashHidden.current = true;
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Wait until both the navigator state is ready AND the layout is mounted
    if (!mounted.current || !navigationState?.key) return;
    if (!authChecked) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isCallbackRoute = segments[0] === 'auth' && segments[1] === 'callback';
    const isWelcomeRoute = segments[0] === 'welcome';

    const timeoutId = setTimeout(() => {
      if (pendingAuthNavigation && user) {
        setPendingAuthNavigation(false);
        router.replace('/welcome');
      } else if (!user && !inAuthGroup && !isCallbackRoute && !isWelcomeRoute) {
        router.replace('/(auth)/login');
      } else if (user && inAuthGroup) {
        router.replace('/welcome');
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [user, segments, navigationState?.key, authChecked, pendingAuthNavigation]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" backgroundColor="#064e3b" />
          <Stack initialRouteName="index" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
