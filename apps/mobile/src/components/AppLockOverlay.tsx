import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Vibration, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SecurityService } from '../core/security/security-service';
import { useTranslation } from 'react-i18next';

let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch {}

interface AppLockOverlayProps {
  onUnlock: () => void;
}

export function AppLockOverlay({ onUnlock }: AppLockOverlayProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const triggerHaptic = (type: 'success' | 'error' | 'click') => {
    try {
      if (Haptics) {
        if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        if (type === 'success') Vibration.vibrate(100);
        else if (type === 'error') Vibration.vibrate([0, 100, 50, 100]);
        else Vibration.vibrate(20);
      }
    } catch {}
  };

  const handleAuthenticate = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMsg('');
    
    try {
      const res = await SecurityService.authenticateAsync(t('lock.authPrompt'));
      if (res.success) {
        triggerHaptic('success');
        onUnlock();
      } else {
        triggerHaptic('error');
        if (res.error?.includes('cancel') || res.error?.includes('Cancel')) {
          setErrorMsg(t('lock.cancelled'));
        } else {
          setErrorMsg(res.error || t('lock.systemFail'));
        }
      }
    } catch (e) {
      triggerHaptic('error');
      setErrorMsg(t('lock.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-trigger native security prompt after transition
    const t = setTimeout(() => {
      handleAuthenticate();
    }, 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="shield-checkmark" size={46} color="#10b981" />
        </View>
        <Text style={styles.title}>{t('lock.unlockTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('lock.subtitle')}
        </Text>
      </View>

      <View style={styles.body}>
        {errorMsg !== '' && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={20} color="#f87171" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.unlockBtn, loading && styles.unlockBtnDisabled]}
          onPress={handleAuthenticate}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="lock-open-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.unlockBtnText}>{t('lock.unlockButton')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070a09', // Sleek ultra-dark green/charcoal theme
    zIndex: 99999,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 48,
  },
  header: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 24,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'normal',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  body: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginBottom: 30,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.18)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    width: '100%',
    maxWidth: 320,
    justifyContent: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  unlockBtn: {
    width: '100%',
    maxWidth: 280,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  unlockBtnDisabled: {
    opacity: 0.6,
  },
  unlockBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  customIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  customIconText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#10b981',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginTop: -1,
  },
  footerBrandingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center',
    marginTop: 2,
  },
});
