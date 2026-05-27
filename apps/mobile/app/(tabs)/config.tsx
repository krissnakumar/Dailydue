import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Image, TouchableOpacity, Platform, KeyboardAvoidingView, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';
import { updateOwnerProfile, uploadOwnerProfilePicture } from '@controle-fiado/api';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useResponsive } from '../../src/utils/responsive';
import { SecurityService } from '../../src/core/security/security-service';
import { promptLogout } from '../../src/core/auth/logout-flow';
import Animated, { FadeInDown, FadeOutUp, Layout } from 'react-native-reanimated';

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const layout = useResponsive();
  const {
    businessConfig,
    updateBusinessConfig,
    user,
    setUser,
    subscription,
    getActiveCustomersCount,
    getCurrentMonthTransactionsCount,
    syncQueue,
    isSyncing,
    failedSyncItems,
    retryFailedSyncItems,
    attemptBackgroundSync,
    isSystemLockEnabled,
    setIsSystemLockEnabled,
    setIsBiometricsEnabled,
    setAutoLockTimeout,
  } = useFiadoStore();

  const customersCount = getActiveCustomersCount();
  const txCount = getCurrentMonthTransactionsCount();

  const [bizName, setBizName] = useState(businessConfig.businessName);
  const [pix, setPix] = useState(businessConfig.pixKey);
  const [phone, setPhone] = useState(businessConfig.phone);
  
  const [userName, setUserName] = useState(user?.full_name || '');
  const [userPic, setUserPic] = useState(user?.picture || user?.avatar_url || '');



  const isLocalPicture = (uri: string) =>
    uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('blob:') || uri.startsWith('data:image/');

  const handleSaveConfig = async () => {
    try {
      let nextPicture = userPic;
      let avatarStoragePath: string | null | undefined = undefined;
      let avatarMimeType: string | null | undefined = undefined;

      if (user && userPic && isLocalPicture(userPic)) {
        const uploaded = await uploadOwnerProfilePicture(userPic);
        nextPicture = uploaded.signed_url;
        avatarStoragePath = uploaded.path;
        avatarMimeType = uploaded.mime_type;
      }

      if (user) {
        await updateOwnerProfile({
          full_name: userName.trim(),
          business_name: bizName.trim(),
          phone: phone.trim(),
          pix_key: pix.trim(),
          avatar_storage_path: avatarStoragePath,
          avatar_mime_type: avatarMimeType,
          picture_url: nextPicture,
        });
        setUser({
          ...user,
          full_name: userName.trim(),
          picture: nextPicture,
          avatar_url: nextPicture,
          avatar_storage_path: avatarStoragePath ?? (user as any).avatar_storage_path,
          avatar_mime_type: avatarMimeType ?? (user as any).avatar_mime_type,
        } as any);
      }

      updateBusinessConfig({
        businessName: bizName.trim(),
        pixKey: pix.trim(),
        phone: phone.trim(),
      });

      setUserPic(nextPicture);
      Alert.alert('Sucesso', 'Configurações salvas com sucesso!');
    } catch (err) {
      console.warn('Erro ao atualizar perfil', err);
      Alert.alert('Ops!', 'Não foi possível salvar o perfil na nuvem agora.');
    }
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
        quality: 0.45,
        base64: false,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUserPic(result.assets[0].uri);
      }
    } catch (error) {
      console.warn('ImagePicker Error', error);
    }
  };

  const handleLogout = () => {
    promptLogout(router);
  };

  const handleGoToLogin = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.wrapper}>
      <Header showTotal={false} title="Configurações do App" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            width: '100%',
            paddingHorizontal: layout.spacing.screen,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >


        {/* Histórico de Falhas de Sincronização */}
        {failedSyncItems.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(220)}
            exiting={FadeOutUp.duration(180)}
            layout={Layout.springify().damping(18).stiffness(180)}
          >
            <Text style={styles.sectionTitle}>Erros de Sincronização</Text>
            <Card style={styles.errorCard}>
              <View style={styles.errorHeader}>
                <Ionicons name="warning" size={20} color="#dc2626" />
                <Text style={styles.errorTitle}>Falhas Recentes ({failedSyncItems.length})</Text>
              </View>
              {failedSyncItems.map((item: any, idx) => {
                const errDetails = item.error_details || {};
                const errMsg = errDetails.message || item.failed_reason || 'Erro desconhecido';
                
                return (
                  <View key={item.id || idx} style={styles.errorItem}>
                    <Text style={styles.errorItemType}>
                      {item.type === 'create_customer' ? 'Criar Cliente' :
                       item.type === 'update_customer' ? 'Atualizar Cliente' :
                       item.type === 'delete_customer' ? 'Excluir Cliente' :
                       item.type === 'delete_transaction' ? 'Excluir Lançamento' :
                       item.type === 'debt' ? 'Nova Venda' :
                       item.type === 'payment' ? 'Novo Pagamento' : item.type}
                    </Text>
                    <Text style={styles.errorItemMsg}>{errMsg}</Text>
                    {errDetails.code && (
                      <Text style={styles.errorItemCode}>Código do erro: {errDetails.code}</Text>
                    )}
                  </View>
                );
              })}
              <TouchableOpacity
                style={[styles.retryErrorsBtn, isSyncing && { opacity: 0.7 }]}
                disabled={isSyncing}
                onPress={async () => {
                  try {
                    await retryFailedSyncItems();
                    Alert.alert('Sincronização', 'Tentando enviar itens pendentes...');
                  } catch (err: any) {
                    Alert.alert('Erro', err.message || 'Falha ao re-tentar.');
                  }
                }}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="refresh-outline" size={18} color="#fff" />
                )}
                <Text style={styles.retryErrorsBtnText}>
                  {isSyncing ? 'Sincronizando...' : 'Re-tentar Sincronização'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearErrorsBtn}
                onPress={() => {
                  Alert.alert(
                    'Limpar Erros',
                    'Deseja limpar o histórico de erros de sincronização?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Limpar',
                        style: 'destructive',
                        onPress: () => useFiadoStore.setState({ failedSyncItems: [] }),
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.clearErrorsBtnText}>Limpar Histórico de Erros</Text>
              </TouchableOpacity>
            </Card>
          </Animated.View>
        )}

        {/* Plano de Assinatura e Limites */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(40)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
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
                {subscription.plan_id === 'premium_monthly'
                  ? 'Plano Premium'
                  : 'Plano Gratuito'}
              </Text>
            </View>
            <View style={[
              styles.badge,
              subscription.plan_id === 'premium_monthly'
                ? styles.badgePremium
                : styles.badgeFree
            ]}>
              <Text style={[
                styles.badgeText,
                subscription.plan_id === 'premium_monthly'
                  ? styles.badgeTextPremium
                  : styles.badgeTextFree
              ]}>
                {subscription.plan_id === 'premium_monthly'
                  ? 'Premium'
                  : 'Grátis'}
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
        </Animated.View>

        {/* Meu Perfil & Dados do Estabelecimento */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(80)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
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
        </Animated.View>

        {/* Segurança */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(120)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>Segurança</Text>
        <Card style={styles.infoCard}>
          <View>
            {/* App Lock Master Switch */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.textMain }}>
                  Bloqueio por Segurança do Sistema
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 }}>
                  Exige biometria ou PIN do seu aparelho após 3 minutos de inatividade.
                </Text>
              </View>
              <Switch
                value={!!isSystemLockEnabled}
                onValueChange={async (value) => {
                  if (value) {
                    const supported = await SecurityService.isSecuritySupportedAsync();
                    if (!supported) {
                      Alert.alert(
                        'Segurança não configurada',
                        'Seu dispositivo não possui uma tela de bloqueio segura configurada (PIN, padrão, senha ou biometria). Ative a segurança nas configurações do Android antes de habilitar esta proteção.',
                        [{ text: 'Entendi' }]
                      );
                      return;
                    }
                    const auth = await SecurityService.authenticateAsync('Confirme sua identidade para ativar a segurança do Fiado.');
                    if (auth.success) {
                      setIsSystemLockEnabled(true);
                      setIsBiometricsEnabled(true);
                      setAutoLockTimeout(180000); // 3 minutes timeout
                      Alert.alert('Sucesso', 'Proteção nativa ativada com sucesso!');
                    }
                  } else {
                    const auth = await SecurityService.authenticateAsync('Confirme sua identidade para desativar a segurança do Fiado.');
                    if (auth.success) {
                      setIsSystemLockEnabled(false);
                      setIsBiometricsEnabled(false);
                      setAutoLockTimeout(0);
                      Alert.alert('Sucesso', 'Proteção de segurança desativada.');
                    }
                  }
                }}
                trackColor={{ false: '#767577', true: '#10b981' }}
                thumbColor={Platform.OS === 'android' ? '#f4f3f4' : undefined}
              />
            </View>

            {isSystemLockEnabled && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                <Ionicons name="shield-checkmark" size={16} color="#10b981" style={{ marginRight: 6 }} />
                <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '600' }}>
                  Protegido pela segurança integrada do dispositivo
                </Text>
              </View>
            )}
          </View>
        </Card>
        </Animated.View>

        {/* Informações do Sistema */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(160)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>Informações do Aplicativo</Text>
        <Card style={styles.infoCard}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={async () => {
              if (syncQueue.length === 0) {
                Alert.alert(
                  'Sincronização',
                  'Excelente! Todos os seus dados locais já estão 100% atualizados na nuvem.',
                  [{ text: 'Entendi', style: 'default' }]
                );
                return;
              }
              if (isSyncing) {
                Alert.alert(
                  'Sincronização em Andamento',
                  'O aplicativo já está enviando suas alterações pendentes para a nuvem neste momento. Por favor, aguarde.',
                  [{ text: 'Entendi', style: 'default' }]
                );
                return;
              }
              Alert.alert(
                'Sincronizar Agora',
                `Deseja enviar manualmente suas ${syncQueue.length} alteração(ões) pendente(s) para a nuvem agora?`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Sincronizar',
                    style: 'default',
                    onPress: async () => {
                      try {
                        await attemptBackgroundSync();
                      } catch (err) {
                        Alert.alert('Erro', 'Não foi possível sincronizar no momento. Verifique sua conexão com a internet.');
                      }
                    }
                  }
                ]
              );
            }}
            style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 3 }}
          >
            <Ionicons name="sync-outline" size={14} color={syncQueue.length > 0 ? theme.colors.primary : theme.colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.infoText, { marginVertical: 0, color: syncQueue.length > 0 ? theme.colors.primary : theme.colors.textMuted, textDecorationLine: syncQueue.length > 0 ? 'underline' : 'none' }]}>
              Fila de Sincronização Local: <Text style={{ fontWeight: 'bold' }}>{syncQueue.length} pendente(s)</Text>
            </Text>
          </TouchableOpacity>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 3 }}>
            <Ionicons name="information-circle-outline" size={14} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.infoText, { marginVertical: 0 }]}>
              Versão do App: <Text style={{ fontWeight: 'bold' }}>1.0.0</Text>
            </Text>
          </View>
          
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                'Política de Privacidade',
                'Nós valorizamos a privacidade dos seus dados. As informações de vendas, fiados e dados de clientes cadastrados no Controle Fiado são armazenadas com segurança na nuvem (Supabase), com acesso restrito à sua conta.\n\nNenhum dado é compartilhado com terceiros. Para ver os termos completos, visite nosso site oficial.',
                [{ text: 'Entendi', style: 'default' }]
              );
            }}
            style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}
          >
            <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>
              Política de Privacidade
            </Text>
          </TouchableOpacity>
        </Card>
        </Animated.View>

        {user ? (
          <Animated.View
            entering={FadeInDown.duration(220).delay(200)}
            layout={Layout.springify().damping(18).stiffness(180)}
          >
            <Text style={styles.sectionTitle}>Conta</Text>
            <Card style={styles.infoCard}>
              <Button
                title="Sair da Conta"
                variant="ghost"
                leftIcon={<Ionicons name="log-out-outline" size={18} color={theme.colors.danger} style={{ marginRight: 6 }} />}
                onPress={handleLogout}
                style={{ borderColor: theme.colors.danger }}
              />
            </Card>
          </Animated.View>
        ) : null}
      </ScrollView>


      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  authCard: {
    padding: 12,
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
    padding: 12,
  },
  formGroup: {
    marginBottom: 10,
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
    padding: 12,
  },
  infoText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginVertical: 3,
  },
  subCard: {
    padding: 12,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
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
    marginBottom: 8,
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
  syncCard: {
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  syncContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  syncTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  syncSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  errorCard: {
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fff5f5',
    borderColor: '#feb2b2',
    borderWidth: 1,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#c53030',
    marginLeft: 8,
  },
  errorItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fed7d7',
  },
  errorItemType: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  errorItemMsg: {
    fontSize: 12,
    color: '#9b2c2c',
    marginTop: 2,
  },
  errorItemCode: {
    fontSize: 10,
    color: '#a0aec0',
    marginTop: 2,
  },
  clearErrorsBtn: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fc8181',
    borderRadius: theme.borderRadius.sm,
  },
  clearErrorsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e53e3e',
  },
  retryErrorsBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: '#16a34a',
    borderRadius: theme.borderRadius.sm,
  },
  retryErrorsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 320,
  },
  modalContent: {
    backgroundColor: '#0c0f0d', // Deep premium dark background
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
    paddingRight: 32,
  },
  modalIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 0,
    top: 6,
  },
});
