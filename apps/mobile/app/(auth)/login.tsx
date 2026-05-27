import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  LayoutAnimation,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useDailyDueStore } from '../../src/store';
import { theme } from '../../src/theme';
import { Button } from '../../src/components';
import { supabase, extractUserMetadata } from '@dailydue/api';
import { getGoogleIdTokenViaNative, isGoogleNativeEnabled } from '../../src/core/auth/googleNative';
import { useTranslation } from 'react-i18next';
import i18n from '../../src/core/i18n';
import {
  establishSessionFromOAuthParams,
  parseOAuthCallbackParams,
} from '../../src/core/auth/oauth-callback';

WebBrowser.maybeCompleteAuthSession();

const APP_SCHEME = 'dailydue';
const AUTH_CALLBACK_PATH = 'auth/callback';
const NATIVE_REDIRECT_URI = `${APP_SCHEME}://${AUTH_CALLBACK_PATH}`;
const AUTH_SESSION_ACTIVE_KEY = '__dailydueAuthSessionActive';

function replaceLocalhostForPhysicalDevice(uri: string): string {
  if (Platform.OS === 'web' || !uri.includes('localhost')) {
    return uri;
  }

  const devServerIp = process.env.EXPO_PUBLIC_DEV_SERVER_IP;
  if (devServerIp) {
    return uri.replace('localhost', devServerIp);
  }

  const devMsg = i18n.t('login.localhostDevWarning');
  console.warn(
    '[Auth] Expo Go generated a localhost redirect URI. ' +
      'Set EXPO_PUBLIC_DEV_SERVER_IP to your computer LAN IP, or use a dev build.'
  );
  throw new Error(devMsg);
}

function getOAuthRedirectUri(): string {
  if (Platform.OS === 'web') {
    return Linking.createURL(AUTH_CALLBACK_PATH);
  }

  if (Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo') {
    return replaceLocalhostForPhysicalDevice(Linking.createURL(AUTH_CALLBACK_PATH));
  }

  return NATIVE_REDIRECT_URI;
}

function getPasswordResetRedirectUri(): string {
  // For password reset, use the web callback or app scheme
  if (Platform.OS === 'web') {
    return Linking.createURL(AUTH_CALLBACK_PATH);
  }
  // For native, use app scheme to handle the reset link
  return NATIVE_REDIRECT_URI;
}

function getProviderConfigMessage(provider: 'Google' | 'Facebook', errorMessage?: string) {
  if (provider === 'Google' && errorMessage?.includes('redirect_uri_mismatch')) {
    const supabaseAuthCallback = `${(process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://<your-project-ref>.supabase.co').replace(/\/$/, '')}/auth/v1/callback`;
    return (
      i18n.t('login.redirectUriMismatchHelp') +
      supabaseAuthCallback
    );
  }

  return errorMessage || (provider === 'Google' ? i18n.t('login.googleLoginError') : i18n.t('login.facebookLoginError'));
}

async function openTrackedAuthSession(url: string, redirectTo: string) {
  const globalAuthState = globalThis as any;
  globalAuthState[AUTH_SESSION_ACTIVE_KEY] = true;
  try {
    return await WebBrowser.openAuthSessionAsync(url, redirectTo);
  } finally {
    globalAuthState[AUTH_SESSION_ACTIVE_KEY] = false;
  }
}

async function startWebOAuth(provider: 'google' | 'facebook', redirectTo: string) {
  const { error: oauthErr } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
    },
  });
  if (oauthErr) throw oauthErr;
}

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { setUser } = useDailyDueStore();
  const [showContent, setShowContent] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [fullNameFocused, setFullNameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const changeMode = (newMode: 'signin' | 'signup' | 'forgot') => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setError(null);
    setMode(newMode);
  };

  // Animations
  const logoScale = useSharedValue(2);
  const logoOpacity = useSharedValue(0);

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardHeightFactor = useSharedValue(0);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        keyboardHeightFactor.value = withTiming(1, { duration: 250 });
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        keyboardHeightFactor.value = withTiming(0, { duration: 250 });
      }
    );

    return () => {
      try {
        showSubscription?.remove?.();
        hideSubscription?.remove?.();
      } catch (e) {
        console.warn('Failed to remove keyboard listeners:', e);
      }
    };
  }, [keyboardHeightFactor]);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(50);
  
  // Icon Transform
  const iconTranslateY = useSharedValue(0);
  const iconScale = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 600 });
    
    // 2. Pulse the logo slightly to show it's alive
    iconScale.value = withTiming(1.05, { duration: 800 }, () => {
      iconScale.value = withTiming(1, { duration: 400 });
    });

    // 3. After 1.2s, smoothly slide it up and reveal the form
    setTimeout(() => {
      logoScale.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.cubic) });
      setShowContent(true);
      contentOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      contentTranslateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    }, 1200);
  }, []);

  const handleIconTap = () => {
    iconScale.value = withTiming(1.1, { duration: 150 }, () => {
        iconScale.value = withTiming(1, { duration: 150 });
    });
  };

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value * (1 - keyboardHeightFactor.value),
    transform: [
      { scale: logoScale.value * (1 - 0.99 * keyboardHeightFactor.value) },
    ],
    height: 110 * (1 - keyboardHeightFactor.value),
    marginBottom: 24 * (1 - keyboardHeightFactor.value),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: iconTranslateY.value },
      { scale: iconScale.value },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));


  const completeOAuthFromBrowser = async (finalUrl: string) => {
    try {
      const params = parseOAuthCallbackParams(finalUrl);
      const session = await establishSessionFromOAuthParams(params);
      if (session) {
        const meta = extractUserMetadata(session.user.user_metadata);
        setUser({
          id: session.user.id,
          email: session.user.email || undefined,
          full_name: meta.full_name,
          picture: meta.picture,
        });
        
        // Wait briefly for store to update and Supabase session to persist,
        // then let the root layout's auth logic handle navigation
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err) {
      console.error('[Auth] completeOAuthFromBrowser error:', err);
      throw err;
    }
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      // Prefer native Google Sign-In on Android (no browser) when configured.
      if (Platform.OS === 'android' && isGoogleNativeEnabled()) {
        const nativeRes = await getGoogleIdTokenViaNative();
        if (nativeRes) {
          const { data, error: idTokenErr } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: nativeRes.idToken,
          });
          if (idTokenErr) {
            throw new Error(idTokenErr.message || t('login.googleNativeAuthError'));
          }

          let sess: any = data?.session;
          if (!sess) {
            // Fallback: fetch session directly from supabase client in case it wasn't returned in the response
            const { data: sessionData } = await supabase.auth.getSession();
            sess = sessionData?.session;
          }

          if (sess) {
            const meta = extractUserMetadata(sess.user.user_metadata);
            setUser({
              id: sess.user.id,
              email: sess.user.email || undefined,
              full_name: meta.full_name,
              picture: meta.picture,
            });
            
            // Wait a brief moment to ensure session is persisted before navigating
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            throw new Error(t('login.googleSessionNotFound'));
          }
          return;
        }
      }

      const redirectTo = getOAuthRedirectUri();

      if (Platform.OS === 'web') {
        await startWebOAuth('google', redirectTo);
        return;
      }

      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (oauthErr) {
        throw new Error(oauthErr.message || t('login.googleOAuthStartError'));
      }
      if (!data?.url) {
        throw new Error(t('login.googleUrlError'));
      }

      const res = await openTrackedAuthSession(data.url, redirectTo);
      if (res.type !== 'success' || !('url' in res) || !res.url) {
        // user cancelled / dismissed
        return;
      }

      const finalUrl = res.url;
      await completeOAuthFromBrowser(finalUrl);
    } catch (e: any) {
      setError(getProviderConfigMessage('Google', e?.message));
    } finally {
      setBusy(false);
    }
  };

  const handleFacebookLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const redirectTo = getOAuthRedirectUri();

      if (Platform.OS === 'web') {
        await startWebOAuth('facebook', redirectTo);
        return;
      }

      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (oauthErr) {
        throw new Error(oauthErr.message || t('login.facebookOAuthStartError'));
      }
      if (!data?.url) {
        throw new Error(t('login.facebookUrlError'));
      }

      const res = await openTrackedAuthSession(data.url, redirectTo);
      if (res.type !== 'success' || !('url' in res) || !res.url) {
        return;
      }

      await completeOAuthFromBrowser(res.url);
    } catch (e: any) {
      setError(e?.message || t('login.facebookLoginError'));
    } finally {
      setBusy(false);
    }
  };

  const handleAuth = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError(t('login.enterEmail'));
      return;
    }
    if (mode === 'signup') {
      const cleanName = fullName.trim();
      if (!cleanName) {
        setError(t('login.enterFullName'));
        return;
      }
    }
    if (mode !== 'forgot' && !password) {
      setError(t('login.enterPassword'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (mode === 'forgot') {
        const redirectTo = getPasswordResetRedirectUri();
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo,
        });
        if (resetErr) {
          throw new Error(resetErr.message || t('login.recoveryEmailError'));
        }

        if (Platform.OS === 'web') {
          alert(t('login.recoveryEmailSentDesc'));
          changeMode('signin');
        } else {
          Alert.alert(
            t('login.recoveryEmailSent'),
            t('login.recoveryEmailSentDesc'),
            [{ text: t('login.ok'), onPress: () => changeMode('signin') }]
          );
        }
      } else if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });
        if (signUpErr) {
          throw new Error(signUpErr.message || t('login.accountCreationError'));
        }

        const sess = data.session;
        if (sess && sess.user) {
          const meta = extractUserMetadata(sess.user.user_metadata);
          setUser({
            id: sess.user.id,
            email: sess.user.email || undefined,
            full_name: meta.full_name,
            picture: meta.picture,
          });
          
          // Wait briefly for store to update and Supabase session to persist,
          // then let the root layout's auth logic handle navigation
          await new Promise(resolve => setTimeout(resolve, 200));
          return;
        }

        // Session may be null if email confirmation is required
        const emailUser = data.user;
        const needsConfirmation = !sess && emailUser?.identities?.length === 0;
        
        if (needsConfirmation || (!sess && !emailUser?.email_confirmed_at)) {
          if (Platform.OS === 'web') {
            alert(t('login.signUpSuccessDesc', { email: cleanEmail }));
            changeMode('signin');
          } else {
            Alert.alert(
              t('login.confirmEmailTitle'),
              t('login.confirmEmailDesc', { email: cleanEmail }),
              [{ text: t('login.okGotIt'), onPress: () => changeMode('signin') }]
            );
          }
        } else {
          // Session exists -> user is already confirmed
          if (Platform.OS === 'web') {
            alert(t('login.accountCreatedSuccessDesc'));
            changeMode('signin');
          } else {
            Alert.alert(
              t('login.accountCreatedTitle'),
              t('login.accountCreatedSuccessDesc'),
              [{ text: t('login.ok'), onPress: () => changeMode('signin') }]
            );
          }
        }
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInErr) {
          throw new Error(signInErr.message || t('login.signInError'));
        }

        const sess = data.session;
        if (!sess || !sess.user) {
          if (Platform.OS === 'web') {
            setError(t('login.emailNotConfirmedFull', { email: cleanEmail }));
          } else {
            Alert.alert(
              t('login.emailNotConfirmedTitle'),
              t('login.emailNotConfirmedDesc', { email: cleanEmail }),
              [{ text: t('login.ok') }]
            );
          }
          return;
        }
        
        const meta = extractUserMetadata(sess.user.user_metadata);
        setUser({
          id: sess.user.id,
          email: sess.user.email || undefined,
          full_name: meta.full_name,
          picture: meta.picture,
        });
        
        // Wait briefly for store to update and Supabase session to persist,
        // then let the root layout's auth logic handle navigation
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (e: any) {
      const errorMsg = typeof e.message === 'string' ? e.message : t('login.authError');
      console.error('[Auth] handleAuth error:', errorMsg, e);
      setError(errorMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.bubble1} />
      <View style={styles.bubble2} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContainer,
          keyboardVisible && { justifyContent: 'flex-start' }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={true}
      >
        <View style={styles.innerContainer}>
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
            <Text style={styles.logoText}>{t('app.name')}</Text>
          </Animated.View>

          {showContent && (
            <Animated.View style={[styles.content, contentStyle]}>
              <View style={styles.onboardingBox}>
                <Text style={styles.welcomeText}>
                  {mode === 'forgot'
                    ? t('login.recoverAccess')
                    : mode === 'signup'
                    ? t('login.startNow')
                    : t('login.goodToSeeYou')}
                </Text>
                <Text style={styles.description}>
                  {mode === 'forgot'
                    ? t('login.forgotPasswordDesc')
                    : mode === 'signup'
                    ? t('login.signUpDesc')
                    : t('login.signInDesc')}
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.form}>
                {mode === 'signup' && (
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>{t('login.nameLabel')}</Text>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      autoCapitalize="words"
                      placeholder={t('login.namePlaceholder')}
                      placeholderTextColor="#94a3b8"
                      style={[styles.input, fullNameFocused && styles.inputFocused]}
                      onFocus={() => setFullNameFocused(true)}
                      onBlur={() => setFullNameFocused(false)}
                    />
                  </View>
                )}

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>{t('login.emailLabel')}</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder={t('login.emailPlaceholder')}
                    placeholderTextColor="#94a3b8"
                    style={[styles.input, emailFocused && styles.inputFocused]}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                  />
                </View>
                {mode !== 'forgot' && (
                  <View style={styles.inputWrap}>
                    <View style={styles.passwordHeader}>
                      <Text style={styles.inputLabel}>{t('login.passwordLabel')}</Text>
                      {mode === 'signin' && (
                        <TouchableOpacity onPress={() => changeMode('forgot')} activeOpacity={0.7}>
                          <Text style={styles.forgotText}>{t('login.forgotLink')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      placeholder={t('login.passwordPlaceholder')}
                      placeholderTextColor="#94a3b8"
                      style={[styles.input, passwordFocused && styles.inputFocused]}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                    />
                  </View>
                )}
              </View>

              <View style={styles.actions}>
                <Button
                  title={busy ? t('login.wait') : mode === 'forgot' ? t('login.sendRecoveryLink') : mode === 'signup' ? t('login.createFreeAccount') : t('login.signInToStore')}
                  variant="primary"
                  onPress={handleAuth}
                  disabled={busy}
                />

                {mode === 'signin' ? (
                  <>
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>{t('login.orContinueWith')}</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    <View style={styles.socialRow}>
                      <TouchableOpacity
                        style={[styles.socialBtn, busy && { opacity: 0.6 }]}
                        onPress={handleGoogleLogin}
                        activeOpacity={0.75}
                        disabled={busy}
                      >
                        <Text style={styles.googleIconText}>G</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.socialBtn, busy && { opacity: 0.6 }]}
                        onPress={handleFacebookLogin}
                        activeOpacity={0.75}
                        disabled={busy}
                      >
                        <Text style={styles.facebookIconText}>f</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}

                <TouchableOpacity
                  style={styles.switchMode}
                  onPress={() => changeMode(mode === 'forgot' ? 'signin' : mode === 'signin' ? 'signup' : 'signin')}
                  activeOpacity={0.7}
                  disabled={busy}
                >
                  <Text style={styles.switchModeText}>
                    {mode === 'forgot'
                      ? t('common.back')
                      : mode === 'signin'
                      ? t('login.signUp')
                      : t('login.signIn')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: theme.colors.primaryBrand,
    position: 'relative',
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  bubble1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#10b981',
    opacity: 0.15,
  },
  bubble2: {
    position: 'absolute',
    bottom: -150,
    left: -150,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: '#047857',
    opacity: 0.25,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  innerContainer: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
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
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...theme.shadows.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  onboardingBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textMain,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  actions: {
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  form: {
    width: '100%',
    gap: 12,
    marginBottom: 20,
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
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  forgotText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '700',
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
  inputFocused: {
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
  },
  errorBox: {
    width: '100%',
    backgroundColor: 'rgba(244,63,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.25)',
    padding: 10,
    borderRadius: 14,
    marginBottom: 12,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    fontSize: 12,
    color: '#94a3b8',
    paddingHorizontal: 10,
    fontWeight: '600',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  socialBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  googleIconText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ef4444',
  },
  facebookIconText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1877f2',
    marginTop: -2,
  },
});
