import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';

export default function AuthCallback() {
  const router = useRouter();
  const { user, authChecked } = useFiadoStore();

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
      <Text style={styles.loadingText}>Finalizando autenticação...</Text>
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
