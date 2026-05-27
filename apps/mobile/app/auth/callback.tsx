import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useDailyDueStore } from '../../src/store';
import { theme } from '../../src/theme';
import { supabase, extractUserMetadata } from '@dailydue/api';

export default function AuthCallback() {
  const router = useRouter();
  const { user, authChecked, setUser } = useDailyDueStore();
  const [message, setMessage] = useState('Finalizando autenticação...');

  useEffect(() => {
    let active = true;

    const readParam = (params: Record<string, string | string[] | undefined>, key: string) => {
      const value = params[key];
      return Array.isArray(value) ? value[0] : value;
    };

    const completeCallback = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const normalizedUrl = initialUrl?.replace('#', initialUrl.includes('?') ? '&' : '?') || '';
        const parsed = normalizedUrl ? Linking.parse(normalizedUrl) : { queryParams: {} };
        const params = (parsed.queryParams || {}) as Record<string, string | string[] | undefined>;
        const code = readParam(params, 'code');
        const accessToken = readParam(params, 'access_token');
        const refreshToken = readParam(params, 'refresh_token');
        const authError = readParam(params, 'error_description') || readParam(params, 'error');

        if (authError) throw new Error(authError);

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data.session && active) {
            const meta = extractUserMetadata(data.session.user.user_metadata);
            setUser({
              id: data.session.user.id,
              email: data.session.user.email || undefined,
              full_name: meta.full_name,
              picture: meta.picture,
            });
            router.replace('/welcome');
          }
          return;
        }

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (data.session && active) {
            const meta = extractUserMetadata(data.session.user.user_metadata);
            setUser({
              id: data.session.user.id,
              email: data.session.user.email || undefined,
              full_name: meta.full_name,
              picture: meta.picture,
            });
            router.replace('/welcome');
          }
          return;
        }

        setMessage('Conferindo sessão...');
      } catch (error: any) {
        console.warn('[Auth] Callback failed:', error);
        if (active) {
          setMessage(error?.message || 'Não foi possível finalizar o login.');
          setTimeout(() => router.replace('/(auth)/login'), 1800);
        }
      }
    };

    completeCallback();

    return () => {
      active = false;
    };
  }, [router, setUser]);

  useEffect(() => {
    // 1. If user is authenticated, show the welcome handoff before Home.
    if (user) {
      router.replace('/welcome');
      return;
    }

    // 2. If auth check is complete and no user is signed in after a short timeout
    // (giving enough time for the code exchange in _layout to complete), redirect to login.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (authChecked) {
      timeoutId = setTimeout(() => {
        if (!user) {
          router.replace('/(auth)/login');
        }
      }, 2200);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user, authChecked, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#ffffff" />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryBrand,
  },
  loadingText: {
    marginTop: 16,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
