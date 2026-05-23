import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';
import { supabase } from '@controle-fiado/api';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const {
    businessConfig,
    updateBusinessConfig,
    user,
    setUser,
    subscription,
    getActiveCustomersCount,
    getCurrentMonthTransactionsCount,
  } = useFiadoStore();

  const customersCount = getActiveCustomersCount();
  const txCount = getCurrentMonthTransactionsCount();

  const [bizName, setBizName] = useState(businessConfig.businessName);
  const [pix, setPix] = useState(businessConfig.pixKey);
  const [phone, setPhone] = useState(businessConfig.phone);
  
  const [userName, setUserName] = useState(user?.full_name || '');
  const [userPic, setUserPic] = useState(user?.picture || user?.avatar_url || '');

  const handleSaveConfig = async () => {
    updateBusinessConfig({
      businessName: bizName.trim(),
      pixKey: pix.trim(),
      phone: phone.trim(),
    });
    
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: userName.trim(),
            picture: userPic,
          }
        });
        setUser({ ...user, full_name: userName.trim(), picture: userPic });
      } catch (err) {
        console.warn('Erro ao atualizar perfil', err);
      }
    }
    
    Alert.alert('Sucesso', 'Configurações salvas com sucesso!');
  };

  const handlePickPicture = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria para alterar a foto.', [{ text: 'OK', style: 'cancel' }]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.2,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setUserPic(base64Data);
      }
    } catch (error) {
      console.warn('ImagePicker Error', error);
    }
  };

  const handleLogout = () => {
    Alert.alert('Desconectar', 'Deseja desconectar a conta atual e voltar ao modo balcão offline?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sim, Sair',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore
          } finally {
            setUser(null);
          }
        },
      },
    ]);
  };

  const handleGoToLogin = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.wrapper}>
      <Header showTotal={false} title="Configurações do App" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Plano de Assinatura e Limites */}
        <Text style={styles.sectionTitle}>Assinatura & Limites de Uso</Text>
        <Card style={styles.subCard}>
          <View style={styles.subHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name={subscription.is_premium ? 'sparkles' : 'ribbon-outline'}
                size={20}
                color={subscription.is_premium ? '#eab308' : theme.colors.textMuted}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.subTitle}>
                {subscription.is_premium ? 'Plano Premium' : 'Plano Gratuito'}
              </Text>
            </View>
            <View style={[
              styles.badge,
              subscription.is_premium ? styles.badgePremium : styles.badgeFree
            ]}>
              <Text style={[
                styles.badgeText,
                subscription.is_premium ? styles.badgeTextPremium : styles.badgeTextFree
              ]}>
                {subscription.is_premium ? 'Premium' : 'Básico'}
              </Text>
            </View>
          </View>

          {/* Progress indicators */}
          <View style={styles.limitRow}>
            <View style={styles.limitHeader}>
              <Text style={styles.limitLabel}>Clientes cadastrados</Text>
              <Text style={styles.limitValue}>
                {customersCount} / {subscription.max_customers ?? '∞'}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[
                styles.progressBarFill,
                {
                  width: subscription.max_customers
                    ? `${Math.min(100, (customersCount / subscription.max_customers) * 100)}%`
                    : '100%',
                  backgroundColor: subscription.is_premium
                    ? theme.colors.primary
                    : (subscription.max_customers !== null && customersCount >= subscription.max_customers)
                    ? theme.colors.danger
                    : theme.colors.accent,
                }
              ]} />
            </View>
          </View>

          <View style={styles.limitRow}>
            <View style={styles.limitHeader}>
              <Text style={styles.limitLabel}>Lançamentos do mês</Text>
              <Text style={styles.limitValue}>
                {txCount} / {subscription.max_transactions_per_month ?? '∞'}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[
                styles.progressBarFill,
                {
                  width: subscription.max_transactions_per_month
                    ? `${Math.min(100, (txCount / subscription.max_transactions_per_month) * 100)}%`
                    : '100%',
                  backgroundColor: subscription.is_premium
                    ? theme.colors.primary
                    : (subscription.max_transactions_per_month !== null && txCount >= subscription.max_transactions_per_month)
                    ? theme.colors.danger
                    : theme.colors.accent,
                }
              ]} />
            </View>
          </View>

          <Button
            title="Gerenciar Limites & Planos"
            variant="ghost"
            leftIcon={<Ionicons name="options-outline" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />}
            onPress={() => router.push('/subscription')}
            style={{ marginTop: 12 }}
          />
        </Card>

        {/* Meu Perfil & Dados do Estabelecimento */}
        <Text style={styles.sectionTitle}>Meu Perfil e Estabelecimento</Text>
        <Card style={styles.formCard}>
          {user ? (
            <View style={{ marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <TouchableOpacity onPress={handlePickPicture} style={styles.profileAvatar}>
                  {userPic ? (
                    <Image source={{ uri: userPic }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <Text style={styles.profileAvatarText}>
                      {userName ? userName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  )}
                  <View style={{ position: 'absolute', bottom: -4, right: -4, backgroundColor: theme.colors.primary, borderRadius: 10, padding: 2 }}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.label}>Seu Nome</Text>
                  <TextInput 
                    style={[styles.input, { height: 40, marginBottom: 0 }]} 
                    value={userName} 
                    onChangeText={setUserName} 
                    placeholder="Seu nome"
                  />
                </View>
              </View>
              <Text style={styles.profileEmail}>Conta de Acesso: {user.email}</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                <Ionicons name="warning-outline" size={16} color="#ca8a04" style={{ marginRight: 6 }} />
                <Text style={[styles.authWarnTitle, { marginBottom: 0 }]}>Conta Local (Sem Nuvem)</Text>
              </View>
              <Text style={styles.authWarnDesc}>
                Conecte-se para manter um backup seguro dos seus dados.
              </Text>
              <Button
                title="Criar Perfil / Entrar"
                variant="primary"
                onPress={handleGoToLogin}
                style={{ marginTop: 12, width: '100%' }}
              />
            </View>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Nome do Estabelecimento</Text>
            <TextInput style={styles.input} value={bizName} onChangeText={setBizName} />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Chave PIX (Para Copia e Cola de Faturas)</Text>
            <TextInput
              style={styles.input}
              placeholder="E-mail, CPF, Celular ou Aleatória"
              value={pix}
              onChangeText={setPix}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>WhatsApp de Atendimento</Text>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <Button
            title="Salvar Alterações"
            variant="accent"
            leftIcon={<Ionicons name="save-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
            onPress={handleSaveConfig}
            style={{ marginTop: 8 }}
          />
        </Card>

        {/* Informações do Sistema */}
        <Text style={styles.sectionTitle}>Informações do Aplicativo</Text>
        <Card style={styles.infoCard}>
          <Text style={styles.infoText}>Versão do Build: <Text style={{ fontWeight: 'bold' }}>1.0.0 (Expo 51)</Text></Text>
          <Text style={styles.infoText}>Mecanismo Offline: <Text style={{ color: theme.colors.success }}>Ativo (AsyncStorage)</Text></Text>
          <Text style={styles.infoText}>Fila de Sincronização Local: <Text style={{ fontWeight: 'bold' }}>0 pendente(s)</Text></Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  authCard: {
    padding: 16,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0369a1',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  authWarnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ca8a04',
    marginBottom: 6,
    textAlign: 'center',
  },
  authWarnDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  formCard: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
    marginBottom: 4,
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    height: 46,
    paddingHorizontal: 12,
    fontSize: 15,
    color: theme.colors.textMain,
  },
  infoCard: {
    padding: 16,
  },
  infoText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginVertical: 3,
  },
  subCard: {
    padding: 16,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeFree: {
    backgroundColor: '#f1f5f9',
  },
  badgePremium: {
    backgroundColor: '#fef9c3',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextFree: {
    color: '#64748b',
  },
  badgeTextPremium: {
    color: '#a16207',
  },
  limitRow: {
    marginBottom: 12,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  limitLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  limitValue: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});
