import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
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
  const { customers, user, setUser } = useFiadoStore();

  // Calcula total geral a receber
  const totalRecebiveis = customers.reduce((acc, curr) => acc + (curr.total_debt || 0), 0);

  const handleAccountAction = () => {
    if (user) {
      Alert.alert(
        'Sair da Conta',
        'Deseja realmente desconectar e voltar para a tela inicial?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sair',
            style: 'destructive',
            onPress: async () => {
              try {
                await supabase.auth.signOut();
              } catch {
                // ignore; still clear local session
              } finally {
                setUser(null);
                router.replace('/(auth)/login');
              }
            },
          },
        ]
      );
    } else {
      router.push('/config');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.topRow}>
        {leftAction ? (
          <View style={styles.titleWrapper}>
            {leftAction}
            <Text style={styles.titleText}>{title}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.titleWrapper}
            activeOpacity={0.75}
            onPress={() => router.replace('/(tabs)/home')}
          >
            <View style={styles.logoBadge}>
              <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
            </View>
            <Text style={styles.titleText}>{title}</Text>
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
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  logoImage: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
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

});
