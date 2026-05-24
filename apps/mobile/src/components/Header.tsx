import React, { ReactNode, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFiadoStore } from '../store';
import { formatCurrency } from '../utils';
import { theme } from '../theme';
import { supabase } from '@controle-fiado/api';
import { Ionicons } from '@expo/vector-icons';

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
  const { customers, user, setUser, subscription } = useFiadoStore();

  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  // Calcula total geral a receber
  const totalRecebiveis = customers.reduce((acc, curr) => acc + (curr.total_debt || 0), 0);

  const handleAccountAction = () => {
    if (user) {
      const doLogout = async () => {
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn('Erro ao desconectar', error);
        } finally {
          setUser(null);
          router.replace('/(auth)/login');
        }
      };

      if (Platform.OS === 'web') {
        if (window.confirm('Deseja realmente desconectar e voltar para a tela inicial?')) {
          void doLogout();
        }
        return;
      }

      Alert.alert('Sair da Conta', 'Deseja realmente desconectar e voltar para a tela inicial?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: () => {
            void doLogout();
          },
        },
      ]);
    } else {
      router.push('/config');
    }
  };

  const paddingTopValue = insets.top > 0 ? insets.top + 12 : Platform.OS === 'android' ? 38 : 16;

  return (
    <View style={[styles.container, { paddingTop: paddingTopValue }]}>
      <View style={styles.topRow}>
        {leftAction ? (
          <View style={styles.titleWrapper}>
            {leftAction}
            <Text style={styles.titleText}>{title}</Text>
            <TouchableOpacity onPress={() => router.push('/subscription')} style={styles.planBadgeContainer}>
               <Animated.View style={[styles.planBadge, subscription.is_premium ? styles.planBadgePremium : styles.planBadgeBasic, subscription.is_premium && { transform: [{ scale: pulseAnim }] }]}>
                  <Ionicons name={subscription.is_premium ? "star" : "leaf"} size={10} color="#fff" />
                  <Text style={styles.planBadgeText}>{subscription.is_premium ? 'PRO' : 'BÁSICO'}</Text>
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
                 <Animated.View style={[styles.planBadge, subscription.is_premium ? styles.planBadgePremium : styles.planBadgeBasic, subscription.is_premium && { transform: [{ scale: pulseAnim }] }]}>
                    <Ionicons name={subscription.is_premium ? "star" : "leaf"} size={10} color="#fff" />
                    <Text style={styles.planBadgeText}>{subscription.is_premium ? 'PRO' : 'BÁSICO'}</Text>
                 </Animated.View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.actionsWrapper}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={user ? 'Sair' : 'Conta'}
            style={[
              styles.accountIconBtn,
              user && {
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              },
            ]}
            onPress={handleAccountAction}
            activeOpacity={0.7}
          >
            {user ? (
              <Ionicons name="log-out-outline" size={18} color="#fecaca" />
            ) : (
              <Ionicons name="person-circle-outline" size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.primaryBrand,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
    ...theme.shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  planBadgeBasic: {
    backgroundColor: 'rgba(255,255,255,0.2)', // Semi-transparent for basic
  },
  planBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});
