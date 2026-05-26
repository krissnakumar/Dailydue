import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Image, TouchableOpacity, Platform, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';
import { supabase, updateOwnerProfile, uploadOwnerProfilePicture } from '@controle-fiado/api';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useResponsive } from '../../src/utils/responsive';

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
    const pendingCount = useFiadoStore.getState().syncQueue.length;

    const performSyncAndLogout = async () => {
      try {
        console.log('[Logout] Sincronizando dados pendentes...');
        await useFiadoStore.getState().flushSyncQueue();
      } catch (err) {
        console.warn('[Logout] Falha na sincronização final:', err);
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
        const currentUser = useFiadoStore.getState().user;
        if (currentUser?.id && currentUser.id !== 'usr_offline') {
          console.log('[Logout] Criando backup de segurança dos dados offline...');
          await useFiadoStore.getState().backupOfflineUserData(currentUser.id);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        await supabase.auth.signOut();
      } catch (error) {
        console.warn('Erro ao desconectar', error);
      } finally {
        setUser(null);
        useFiadoStore.getState().resetDemoData();
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
        {/* Status de Sincronização */}
        <Text style={styles.sectionTitle}>Sincronização na Nuvem</Text>
        <Card style={styles.syncCard}>
          <View style={styles.syncContainer}>
            {(() => {
              if (!user || user.id === 'usr_offline') {
                return (
                  <>
                    <View style={[styles.syncDot, { backgroundColor: '#eab308' }]} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.syncTitle}>Modo Balcão Offline</Text>
                      <Text style={styles.syncSubtitle}>
                        Seus dados estão 100% seguros localmente no seu aparelho.
                      </Text>
                    </View>
                  </>
                );
              }

              if (isSyncing) {
                return (
                  <>
                    <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.syncTitle}>Sincronizando...</Text>
                      <Text style={styles.syncSubtitle}>
                        Enviando suas alterações recentes para a nuvem.
                      </Text>
                    </View>
                  </>
                );
              }

              if (syncQueue.length > 0) {
                return (
                  <>
                    <View style={[styles.syncDot, { backgroundColor: '#f97316' }]} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.syncTitle}>Alterações Pendentes ({syncQueue.length})</Text>
                      <Text style={styles.syncSubtitle}>
                        Há dados locais aguardando conexão com a internet para salvar na nuvem.
                      </Text>
                    </View>
                  </>
                );
              }

              return (
                <>
                  <View style={[styles.syncDot, { backgroundColor: '#22c55e' }]} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.syncTitle}>Sincronizado</Text>
                    <Text style={styles.syncSubtitle}>
                      Suas alterações e dados estão atualizados na nuvem.
                    </Text>
                  </View>
                </>
              );
            })()}
          </View>
        </Card>

        {/* Histórico de Falhas de Sincronização */}
        {failedSyncItems.length > 0 && (
          <>
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
          </>
        )}

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
});
