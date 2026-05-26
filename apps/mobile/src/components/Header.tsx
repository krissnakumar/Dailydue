import React, { ReactNode, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFiadoStore } from '../store';
import { formatCurrency } from '../utils';
import { theme } from '../theme';
import { supabase } from '@controle-fiado/api';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../core/hooks/useNetworkStatus';

export interface HeaderProps {
  showTotal?: boolean;
  title?: string;
  onLogoutPress?: () => void;
  leftAction?: ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  showTotal = true,
  title = 'Fiado',
  onLogoutPress,
  leftAction,
}) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isOffline = useNetworkStatus();
  const {
    customers,
    user,
    setUser,
    subscription,
    syncQueue,
    isSyncing,
    flushSyncQueue,
    backupOfflineUserData,
    resetDemoData,
  } = useFiadoStore();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (subscription.is_premium) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [subscription.is_premium, pulseAnim]);

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [isSyncing, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Calcula total geral a receber
  const totalRecebiveis = customers.reduce((acc, curr) => acc + (curr.total_debt || 0), 0);

  const handleAccountAction = () => {
    if (!user || user.id === 'usr_offline') {
      router.push('/config');
      return;
    }

    const pendingCount = syncQueue.length;

    const performSyncAndLogout = async () => {
      try {
        console.log('[Header Logout] Sincronizando dados pendentes...');
        await flushSyncQueue();
      } catch (err) {
        console.warn('[Header Logout] Falha na sincronização final:', err);
      }

      const remainingCount = useFiadoStore.getState().syncQueue.length;
      if (remainingCount > 0) {
        if (Platform.OS === 'web') {
          if (window.confirm(`Atenção: Você ainda possui ${remainingCount} alterações pendentes de sincronização (talvez esteja offline). Se você sair agora, essas alterações serão perdidas. Deseja sair mesmo assim?`)) {
            void doLogout();
          }
        } else {
          Alert.alert(
            'Dados não salvos!',
            `Você ainda possui ${remainingCount} alterações pendentes que não foram salvas na nuvem. Se sair agora, elas serão perdidas.\n\nDeseja sair mesmo assim?`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Tentar Sincronizar Novamente',
                onPress: () => {
                  void performSyncAndLogout();
                }
              },
              {
                text: 'Sair e Perder Dados',
                style: 'destructive',
                onPress: () => {
                  void doLogout();
                }
              }
            ]
          );
        }
      } else {
        void doLogout();
      }
    };

    const doLogout = async () => {
      try {
        if (user?.id && user.id !== 'usr_offline') {
          console.log('[Header Logout] Criando backup de segurança dos dados offline...');
          await backupOfflineUserData(user.id);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        await supabase.auth.signOut();
      } catch (error) {
        console.warn('Erro ao desconectar', error);
      } finally {
        setUser(null);
        resetDemoData();
        router.replace('/(auth)/login');
      }
    };

    if (pendingCount > 0) {
      if (Platform.OS === 'web') {
        if (window.confirm(`Você possui ${pendingCount} alterações pendentes de sincronização. Deseja tentar salvá-las antes de sair?`)) {
          void performSyncAndLogout();
        } else {
          void doLogout();
        }
      } else {
        Alert.alert(
          'Sincronizar antes de sair?',
          `Você possui ${pendingCount} alterações locais que ainda não foram salvas na nuvem. Deseja sincronizá-las antes de sair?`,
          [
            {
              text: 'Sincronizar e Sair',
              onPress: () => {
                void performSyncAndLogout();
              }
            },
            {
              text: 'Sair Sem Salvar',
              style: 'destructive',
              onPress: () => {
                void doLogout();
              }
            },
            { text: 'Cancelar', style: 'cancel' }
          ]
        );
      }
    } else {
      void doLogout();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.topRow}>
        {leftAction ? (
          <View style={styles.titleWrapper}>
            {leftAction}
            <Text style={styles.titleText}>{title}</Text>
            <TouchableOpacity onPress={() => router.push('/subscription')} style={styles.planBadgeContainer}>
                <Animated.View style={[styles.planBadge, subscription.is_premium ? styles.planBadgePremium : styles.planBadgeFree, subscription.is_premium && { transform: [{ scale: pulseAnim }] }]}>
                  <Ionicons name={subscription.is_premium ? "star" : "leaf"} size={10} color="#fff" />
                  <Text style={styles.planBadgeText}>{subscription.is_premium ? 'PRO' : 'GRÁTIS'}</Text>
               </Animated.View>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.titleWrapper}
            activeOpacity={0.75}
            onPress={() => router.replace('/(tabs)/home')}
          >
            {title === 'Fiado' && <Image source={require('../../assets/icon.png')} style={styles.logoImage} />}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.titleText}>{title}</Text>
              <View style={styles.planBadgeContainer}>
                  <Animated.View style={[styles.planBadge, subscription.is_premium ? styles.planBadgePremium : styles.planBadgeFree, subscription.is_premium && { transform: [{ scale: pulseAnim }] }]}>
                    <Ionicons name={subscription.is_premium ? "star" : "leaf"} size={10} color="#fff" />
                    <Text style={styles.planBadgeText}>{subscription.is_premium ? 'PRO' : 'GRÁTIS'}</Text>
                 </Animated.View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.actionsWrapper}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={user && user.id !== 'usr_offline' ? 'Sair' : 'Conta'}
            style={styles.accountIconBtn}
            onPress={handleAccountAction}
            activeOpacity={0.7}
          >
            {user && user.id !== 'usr_offline' ? (
              <Ionicons name="log-out-outline" size={18} color="#ffffff" />
            ) : (
              <Ionicons name="person-circle-outline" size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Sync Status / Offline Indicators */}
      {isSyncing ? (
        <View style={styles.syncIndicatorRow}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name="sync-outline" size={14} color="#10b981" />
          </Animated.View>
          <Text style={styles.syncIndicatorText}>Sincronizando com a nuvem...</Text>
        </View>
      ) : isOffline ? (
        <View style={styles.syncIndicatorRow}>
          <Ionicons name="cloud-offline-outline" size={14} color="#f59e0b" />
          <Text style={styles.syncIndicatorText}>Aguardando conexão para sincronizar...</Text>
        </View>
      ) : syncQueue.length > 0 ? (
        <View style={styles.syncIndicatorRow}>
          <Ionicons name="cloud-upload-outline" size={14} color="#3b82f6" />
          <Text style={styles.syncIndicatorText}>{syncQueue.length} alteração(ões) pendente(s)</Text>
        </View>
      ) : (
        <View style={styles.syncIndicatorRow}>
          <Ionicons name="checkmark-circle-outline" size={14} color="rgba(255, 255, 255, 0.6)" />
          <Text style={[styles.syncIndicatorText, { color: 'rgba(255, 255, 255, 0.6)' }]}>Nuvem sincronizada</Text>
        </View>
      )}

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="wifi-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.offlineBannerText}>
            Sem internet. Alterações salvando localmente.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.primaryBrand,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
    ...theme.shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 0,
    resizeMode: 'cover',
  },
  titleIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  actionsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountIconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: theme.borderRadius.full,
  },
  accountIcon: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  planBadgeContainer: {
    marginLeft: 8,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  planBadgePremium: {
    backgroundColor: '#fbbf24', // Amber/gold for premium
  },
  planBadgeFree: {
    backgroundColor: 'rgba(255,255,255,0.2)', // Semi-transparent for free
  },
  planBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  syncIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  syncIndicatorText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    fontFamily: 'Outfit',
    marginLeft: 6,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b', // Amber/orange warning
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  offlineBannerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Outfit',
    flex: 1,
  },
});
