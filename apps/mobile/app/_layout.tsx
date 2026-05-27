import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { LogBox, AppState } from 'react-native';
import { useFiadoStore } from '../src/store';
import { supabase, extractUserMetadata } from '@controle-fiado/api';
import { BillingProvider } from '../src/features/billing/providers/BillingProvider';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { AppLockOverlay } from '../src/components/AppLockOverlay';
import {
  establishSessionFromOAuthParams,
  isAuthCallbackUrl,
  parseOAuthCallbackParams,
} from '../src/core/auth/oauth-callback';

LogBox.ignoreLogs(['Invalid Refresh Token']);

SplashScreen.preventAutoHideAsync().catch(() => {});

import { queryClient } from '../src/core/services/query-client';

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
    isSystemLockEnabled,
    setLastActiveTimestamp,
    hasBootstrappedProfile,
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

  const [isUnlocked, setIsUnlocked] = useState(true);
  const lockInitialized = useRef(false);

  const getLockTimeoutMs = () => {
    const timeout = useFiadoStore.getState().autoLockTimeout;
    return timeout > 0 ? timeout : 180_000;
  };

  const shouldRequireLock = () => {
    const { lastActiveTimestamp } = useFiadoStore.getState();
    if (!lastActiveTimestamp) return false;
    return Date.now() - lastActiveTimestamp > getLockTimeoutMs();
  };

  useEffect(() => {
    if (!isSystemLockEnabled) {
      setIsUnlocked(true);
      lockInitialized.current = true;
      return;
    }

    if (!lockInitialized.current) {
      setIsUnlocked(!shouldRequireLock());
      lockInitialized.current = true;
    }
  }, [isSystemLockEnabled]);

  useEffect(() => {
    const handleStateChange = (nextState: string) => {
      if (!useFiadoStore.getState().isSystemLockEnabled) return;

      if (nextState === 'background' || nextState === 'inactive') {
        setLastActiveTimestamp(Date.now());
      } else if (nextState === 'active' && shouldRequireLock()) {
        setIsUnlocked(false);
      }
    };
    const sub = AppState.addEventListener('change', handleStateChange);
    return () => sub.remove();
  }, [setLastActiveTimestamp]);

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

      if (!isAuthCallbackUrl(url)) return;

      const params = parseOAuthCallbackParams(url);
      if (!params.code && !(params.accessToken && params.refreshToken) && !params.error) return;
      handledAuthUrls.current.add(url);

      if (params.error) {
        console.warn('[Auth] OAuth callback returned an error:', params.error);
        return;
      }

      try {
        const session = await establishSessionFromOAuthParams(params);
        if (session) {
          applySessionUser(session);
          setPendingAuthNavigation(true);
        }
      } catch (error) {
        console.warn('[Auth] Failed to complete OAuth callback:', error);
      }
    },
    [applySessionUser]
  );

  useEffect(() => {
    mounted.current = true;

    // Validate Supabase environment variables at startup (Warning #18 Fix)
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        '[Startup] ERRO CRÍTICO: Variáveis de ambiente do Supabase não configuradas!\n' +
        'Por favor, certifique-se de definir EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no seu arquivo .env'
      );
    }

    // Clean up invalid local image URIs (file:// or content://) from customer picture fields
    // since scoped storage permissions are revoked by the OS on cold start/app restart.
    try {
      const state = useFiadoStore.getState();
      if (state.customers && state.customers.length > 0) {
        const cleaned = state.customers.map((c) => {
          if (c.picture && (c.picture.startsWith('file:') || c.picture.startsWith('content:'))) {
            return { ...c, picture: undefined };
          }
          return c;
        });
        useFiadoStore.setState({ customers: cleaned });
      }
    } catch (e) {
      console.warn('[Layout] Failed to clean local URIs on cold start:', e);
    }

    // Tenta sincronizar a fila offline ao inicializar o app
    attemptBackgroundSync();
  }, []);

  useEffect(() => {
    // Listen for AppState changes to automatically refresh expired picture signed URLs and resume sync
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refreshCustomerPictureUrls();
        attemptBackgroundSync();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshCustomerPictureUrls, attemptBackgroundSync]);

  useEffect(() => {
    if (!authChecked) return;

    if (!user?.id) {
      useFiadoStore.setState({ customers: [], syncQueue: [] });
      return;
    }
    if (user.id === 'usr_offline') return;
    
    // Restore offline backed-up data first, then refresh picture URLs and load cloud data
    const initUserData = async () => {
      try {
        await useFiadoStore.getState().restoreOfflineUserData(user.id as string);
      } catch (err) {
        console.warn('[Layout] Failed to restore offline user data:', err);
      }
      try {
        await loadSupabaseData();
      } catch (err) {
        console.warn('[Layout] Failed to load Supabase data:', err);
      }
      try {
        await refreshCustomerPictureUrls();
      } catch (err) {
        console.warn('[Layout] Failed to refresh customer picture URLs:', err);
      }
    };

    void initUserData();
  }, [authChecked, user?.id, refreshCustomerPictureUrls, loadSupabaseData]);

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

    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      if (!active) return;
      if (!sess) {
        if (evt === 'SIGNED_OUT') {
          setUser(null);
        }
        return;
      }
      applySessionUser(sess);
      attemptBackgroundSync();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setUser, applySessionUser, attemptBackgroundSync]);

  useEffect(() => {
    Linking.getInitialURL().then(completeAuthFromUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      completeAuthFromUrl(url);
    });
    return () => sub.remove();
  }, [completeAuthFromUrl]);

  useEffect(() => {
    // Failsafe background sync: if the device goes back online while the app stays open,
    // periodically attempt to flush the offline queue automatically.
    const interval = setInterval(() => {
      attemptBackgroundSync();
    }, 30_000);
    return () => clearInterval(interval);
  }, [attemptBackgroundSync]);

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
    const inOnboardingGroup = segments[0] === '(onboarding)';
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
      } else if (user && user.id !== 'usr_offline' && !hasBootstrappedProfile && !inOnboardingGroup && !isWelcomeRoute) {
        router.replace('/(onboarding)');
      } else if (user && (user.id === 'usr_offline' || hasBootstrappedProfile) && inOnboardingGroup) {
        router.replace('/(tabs)/home');
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [user, segments, navigationState?.key, authChecked, pendingAuthNavigation, hasBootstrappedProfile]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <BillingProvider>
              <StatusBar style="light" backgroundColor="#064e3b" />
              <Stack initialRouteName="index" screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              </Stack>
              {isSystemLockEnabled && !isUnlocked ? (
                <AppLockOverlay
                  onUnlock={() => setIsUnlocked(true)}
                />
              ) : null}
            </BillingProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
