import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withSpring,
} from 'react-native-reanimated';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';
import { Button } from '../../src/components';
import { supabase } from '@controle-fiado/api';

const { width, height } = Dimensions.get('window');

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { setUser } = useFiadoStore();
  const [showContent, setShowContent] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animations
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(20);

  // Icon Random Animations
  const iconTranslateX = useSharedValue(0);
  const iconTranslateY = useSharedValue(0);
  const iconRotate = useSharedValue(0);
  const iconScale = useSharedValue(1);

  useEffect(() => {
    // Splash sequence
    logoOpacity.value = withTiming(1, { duration: 1000 });
    logoScale.value = withTiming(1.05, { duration: 900, easing: Easing.out(Easing.cubic) });

    const timer = setTimeout(() => {
      setShowContent(true);
      logoScale.value = withTiming(0.9, { duration: 800 });
      contentOpacity.value = withTiming(1, { duration: 800 });
      contentTranslateY.value = withTiming(0, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
    }, 1500);

    // Random idle movements after splash intro
    let intervalId: any;
    let idleTimeoutId: any;

    const startTimeout = setTimeout(() => {
      intervalId = setInterval(() => {
        const targetX = (Math.random() - 0.5) * 16; // -8 to 8
        const targetY = (Math.random() - 0.5) * 16; // -8 to 8
        const targetRotate = (Math.random() - 0.5) * 24; // -12deg to 12deg
        const targetScale = 0.95 + Math.random() * 0.15; // 0.95 to 1.10

        iconTranslateX.value = withSpring(targetX, { damping: 12, stiffness: 90 });
        iconTranslateY.value = withSpring(targetY, { damping: 12, stiffness: 90 });
        iconRotate.value = withSpring(targetRotate, { damping: 12, stiffness: 90 });
        iconScale.value = withSpring(targetScale, { damping: 12, stiffness: 90 });

        idleTimeoutId = setTimeout(() => {
          iconTranslateX.value = withSpring(0, { damping: 15, stiffness: 100 });
          iconTranslateY.value = withSpring(0, { damping: 15, stiffness: 100 });
          iconRotate.value = withSpring(0, { damping: 15, stiffness: 100 });
          iconScale.value = withSpring(1, { damping: 15, stiffness: 100 });
        }, 1000);
      }, 4000);
    }, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(startTimeout);
      if (intervalId) clearInterval(intervalId);
      if (idleTimeoutId) clearTimeout(idleTimeoutId);
    };
  }, []);

  const handleIconTap = () => {
    // Generate a wild random animation on tap
    const targetX = (Math.random() - 0.5) * 30;
    const targetY = (Math.random() - 0.5) * 30;
    const targetRotate = (Math.random() - 0.5) * 60;
    const targetScale = 1.25 + Math.random() * 0.25;

    iconTranslateX.value = withSpring(targetX, { damping: 5, stiffness: 150 });
    iconTranslateY.value = withSpring(targetY, { damping: 5, stiffness: 150 });
    iconRotate.value = withSpring(targetRotate, { damping: 5, stiffness: 150 });
    iconScale.value = withSpring(targetScale, { damping: 5, stiffness: 150 });

    setTimeout(() => {
      iconTranslateX.value = withSpring(0, { damping: 10, stiffness: 120 });
      iconTranslateY.value = withSpring(0, { damping: 10, stiffness: 120 });
      iconRotate.value = withSpring(0, { damping: 10, stiffness: 120 });
      iconScale.value = withSpring(1, { damping: 10, stiffness: 120 });
    }, 500);
  };

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: iconTranslateX.value },
      { translateY: iconTranslateY.value },
      { rotate: `${iconRotate.value}deg` },
      { scale: iconScale.value },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const handleOfflineMode = () => {
    setUser({
      id: 'usr_offline',
      email: 'offline@loja.local',
      full_name: 'Dono da Loja',
    });
    router.replace('/(tabs)/home');
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const redirectTo = AuthSession.makeRedirectUri({
        path: 'auth/callback',
      });

      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (oauthErr) throw oauthErr;
      if (!data?.url) throw new Error('OAuth_URL_MISSING');

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success' || !('url' in res) || !res.url) {
        // user cancelled / dismissed
        return;
      }

      const finalUrl = res.url;
      const getParam = (urlStr: string, key: string) => {
        if (!urlStr) return null;
        try {
          // 1. Try manual string parsing (most reliable for custom schemes in RN/Hermes)
          const regex = new RegExp(`[?#&]${key}=([^&#]*)`);
          const match = urlStr.match(regex);
          if (match && match[1]) {
            return decodeURIComponent(match[1]);
          }

          // 2. Try standard URL parser as a fallback
          const u = new URL(urlStr);
          const fromSearch = u.searchParams.get(key);
          if (fromSearch) return fromSearch;
          const hash = (u.hash || '').replace(/^#/, '');
          if (hash) {
            const fromHash = new URLSearchParams(hash).get(key);
            if (fromHash) return fromHash;
          }
        } catch {
          // ignore and fall through
        }

        // 3. Fallback for non-standard URLs
        try {
          const parsed = Linking.parse(urlStr);
          const qp = (parsed?.queryParams as any) || {};
          if (typeof qp[key] === 'string') return qp[key];
        } catch {
          // ignore
        }
        return null;
      };

      const code = getParam(finalUrl, 'code');
      const access_token = getParam(finalUrl, 'access_token');
      const refresh_token = getParam(finalUrl, 'refresh_token');
      const error_desc = getParam(finalUrl, 'error_description') || getParam(finalUrl, 'error');

      // Safe debug (no tokens/codes)
      const safeUrl = String(finalUrl)
        .replace(/code=[^&#]+/g, 'code=***')
        .replace(/access_token=[^&#]+/g, 'access_token=***')
        .replace(/refresh_token=[^&#]+/g, 'refresh_token=***');

      console.log('[Auth] OAuth callback', {
        hasCode: Boolean(code),
        hasAccessToken: Boolean(access_token),
        hasRefreshToken: Boolean(refresh_token),
        hasError: Boolean(error_desc),
        safeUrl,
      });

      if (error_desc) {
        throw new Error(error_desc);
      }

      if (code) {
        const { data: exch, error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchErr) throw exchErr;
        const sess = exch.session;
        if (sess) {
          setUser({
            id: sess.user.id,
            email: sess.user.email || undefined,
            full_name:
              (sess.user.user_metadata as any)?.full_name ||
              (sess.user.user_metadata as any)?.name ||
              undefined,
          });
        }
        router.replace('/(tabs)/home');
        return;
      }

      if (access_token && refresh_token) {
        const { data: sessData, error: sessErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessErr) throw sessErr;
        const sess = sessData.session;
        if (sess) {
          setUser({
            id: sess.user.id,
            email: sess.user.email || undefined,
            full_name:
              (sess.user.user_metadata as any)?.full_name ||
              (sess.user.user_metadata as any)?.name ||
              undefined,
          });
        }
        router.replace('/(tabs)/home');
        return;
      }

      throw new Error('OAUTH_CODE_MISSING');
    } catch (e: any) {
      setError(e?.message || 'Falha no login Google.');
    } finally {
      setBusy(false);
    }
  };

  const handleAuth = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Informe e-mail e senha.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (signUpErr) throw signUpErr;

        const user = data.user;
        if (user) {
          setUser({
            id: user.id,
            email: user.email || undefined,
            full_name: (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || undefined,
          });
        }

        // Some Supabase projects require email confirmation; let RootLayout handle routing on session.
        router.replace('/(tabs)/home');
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInErr) throw signInErr;

        const sess = data.session;
        if (sess) {
          setUser({
            id: sess.user.id,
            email: sess.user.email || undefined,
            full_name: (sess.user.user_metadata as any)?.full_name || (sess.user.user_metadata as any)?.name || undefined,
          });
        }
        router.replace('/(tabs)/home');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao autenticar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.splashBg}>
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <TouchableOpacity activeOpacity={0.95} onPress={handleIconTap}>
            <Animated.Image
              source={require('../../assets/icon.png')}
              style={[
                { width: 64, height: 64, marginBottom: 8, borderRadius: 12 },
                iconStyle,
              ]}
            />
          </TouchableOpacity>
          <Text style={styles.logoText}>Fiado</Text>
        </Animated.View>
      </View>

      {showContent && (
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={styles.onboardingBox}>
            <Text style={styles.welcomeText}>{mode === 'signup' ? 'Criar conta' : 'Entrar'}</Text>
            <Text style={styles.description}>Use e-mail e senha (Supabase Auth).</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>E-mail</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="voce@loja.com"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
            </View>
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Senha</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              title={busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : 'Entrar'}
              variant="primary"
              onPress={handleAuth}
              disabled={busy}
            />

            {mode === 'signin' ? (
              <TouchableOpacity
                style={[styles.googleBtn, busy && { opacity: 0.6 }]}
                onPress={handleGoogleLogin}
                activeOpacity={0.75}
                disabled={busy}
              >
                <View style={styles.googleIcon}>
                  <Text style={styles.googleIconText}>G</Text>
                </View>
                <Text style={styles.googleText}>Entrar com Google</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.switchMode}
              onPress={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
              activeOpacity={0.7}
              disabled={busy}
            >
              <Text style={styles.switchModeText}>
                {mode === 'signin' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.offlineBtn} onPress={handleOfflineMode} activeOpacity={0.7} disabled={busy}>
              <Text style={styles.offlineBtnText}>Continuar no modo offline</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>Supabase Auth • Sessão segura</Text>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primaryBrand,
  },
  splashBg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoEmoji: {
    fontSize: 80,
    marginBottom: 10,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: 'Outfit',
    letterSpacing: -1,
  },
  content: {
    height: height * 0.45,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'space-between',
    ...theme.shadows.lg,
  },
  onboardingBox: {
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textMain,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  form: {
    width: '100%',
    gap: 10,
  },
  inputWrap: {
    width: '100%',
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
  },
  errorBox: {
    width: '100%',
    backgroundColor: 'rgba(244,63,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.25)',
    padding: 10,
    borderRadius: 14,
  },
  errorText: {
    color: '#9f1239',
    fontSize: 12,
    fontWeight: '700',
  },
  switchMode: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  switchModeText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  offlineBtn: {
    padding: 14,
    alignItems: 'center',
  },
  offlineBtnText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  googleBtn: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ef4444',
    letterSpacing: 0.2,
  },
  googleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  footer: {
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
