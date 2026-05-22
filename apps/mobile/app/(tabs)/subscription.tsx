import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Clipboard,
  ActivityIndicator,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function SubscriptionScreen() {
  const router = useRouter();
  const {
    subscription,
    getActiveCustomersCount,
    getCurrentMonthTransactionsCount,
    toggleSubscriptionSimulation,
    simulateSubscriptionUpgrade,
    simulateSubscriptionDowngrade,
  } = useFiadoStore();

  const customersCount = getActiveCustomersCount();
  const txCount = getCurrentMonthTransactionsCount();

  // Local UI States
  const [checkoutMethod, setCheckoutMethod] = useState<'pix' | 'card'>('pix');
  const [loading, setLoading] = useState(false);

  // Credit Card Form State
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Sandbox Override options
  const isSimulated = subscription.is_simulated;

  const handleCopyPix = () => {
    const mockPixCode =
      '00020101021226840014br.gov.bcb.pix2562pix.faido.app/checkout/sub_premium_monthly_1199';
    Clipboard.setString(mockPixCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Chave Copiada', 'Código PIX Copia e Cola copiado para a área de transferência!');
  };

  const handleUpgrade = async () => {
    if (checkoutMethod === 'card') {
      if (!cardName.trim() || cardNumber.length < 16 || cardExpiry.length < 5 || cardCvv.length < 3) {
        Alert.alert('Dados Inválidos', 'Por favor, preencha todos os campos do cartão corretamente.');
        return;
      }
    }

    setLoading(true);
    // Simulate API delay
    setTimeout(() => {
      setLoading(false);
      simulateSubscriptionUpgrade(checkoutMethod);
      Alert.alert(
        'Assinatura Ativada',
        'Parabéns! Sua assinatura Premium foi ativada com sucesso (Simulação Local). Todos os seus limites foram liberados!'
      );
    }, 1500);
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancelar Assinatura',
      'Tem certeza que deseja cancelar sua assinatura Premium? Você voltará para o plano gratuito e o limite de 2 clientes e 30 lançamentos mensais será reestabelecido.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: () => {
            simulateSubscriptionDowngrade();
            Alert.alert(
              'Assinatura Cancelada',
              'Sua assinatura Premium foi cancelada. Seus limites voltaram para o plano gratuito.'
            );
          },
        },
      ]
    );
  };

  // Mask helper for Card Number
  const handleCardNumberChange = (text: string) => {
    const clean = text.replace(/\D/g, '');
    const limited = clean.slice(0, 16);
    const matches = limited.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, l = match.length; i < l; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      setCardNumber(parts.join(' '));
    } else {
      setCardNumber(limited);
    }
  };

  // Mask helper for Card Expiry
  const handleCardExpiryChange = (text: string) => {
    const clean = text.replace(/\D/g, '');
    const limited = clean.slice(0, 4);
    if (limited.length >= 3) {
      setCardExpiry(`${limited.slice(0, 2)}/${limited.slice(2, 4)}`);
    } else {
      setCardExpiry(limited);
    }
  };

  const customersPercent = subscription.max_customers
    ? Math.min(100, (customersCount / subscription.max_customers) * 100)
    : 0;

  const txPercent = subscription.max_transactions_per_month
    ? Math.min(100, (txCount / subscription.max_transactions_per_month) * 100)
    : 0;

  return (
    <View style={styles.wrapper}>
      <Header
        showTotal={false}
        title="Assinatura & Limites"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.textMain} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <Card style={[styles.statusCard, subscription.is_premium && styles.premiumStatusCard]}>
          <View style={styles.planBadgeContainer}>
            <Ionicons
              name={subscription.is_premium ? 'sparkles' : 'ribbon-outline'}
              size={24}
              color={subscription.is_premium ? '#ca8a04' : theme.colors.textMuted}
            />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.planSubtitle}>Plano Atual</Text>
              <Text style={styles.planTitle}>
                {subscription.is_premium ? 'Faido Premium' : 'Faido Gratuito'}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                subscription.is_premium ? styles.badgePremium : styles.badgeFree,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  subscription.is_premium ? styles.badgeTextPremium : styles.badgeTextFree,
                ]}
              >
                {subscription.is_premium ? 'Premium' : 'Básico'}
              </Text>
            </View>
          </View>

          {subscription.is_premium ? (
            <View style={styles.planDetailsContainer}>
              <View style={styles.planDetailRow}>
                <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                <Text style={styles.planDetailText}>Clientes e Lançamentos Ilimitados</Text>
              </View>
              <View style={styles.planDetailRow}>
                <Ionicons name="card-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.planDetailText}>
                  Renovação: R$ 11,99 / mês ({subscription.is_simulated ? 'Simulado' : 'Nuvem'})
                </Text>
              </View>
              {subscription.current_period_end && (
                <View style={styles.planDetailRow}>
                  <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.planDetailText}>
                    Próxima cobrança: {new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.planDetailsContainer}>
              <View style={styles.planDetailRow}>
                <Ionicons name="alert-circle-outline" size={16} color="#eab308" />
                <Text style={styles.planDetailText}>Você está usando a versão gratuita limitada</Text>
              </View>
            </View>
          )}
        </Card>

        {/* Limit Meters */}
        <Text style={styles.sectionTitle}>Limites do Plano</Text>
        <Card style={styles.limitsCard}>
          <View style={styles.limitRow}>
            <View style={styles.limitHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="people-outline" size={18} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={styles.limitLabel}>Clientes Cadastrados</Text>
              </View>
              <Text style={styles.limitValue}>
                {customersCount} / {subscription.max_customers ?? 'Ilimitado'}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: subscription.max_customers ? `${customersPercent}%` : '100%',
                    backgroundColor: subscription.is_premium
                      ? '#10b981'
                      : customersPercent >= 100
                      ? theme.colors.danger
                      : '#f59e0b',
                  },
                ]}
              />
            </View>
            {subscription.max_customers && customersCount >= subscription.max_customers && (
              <Text style={styles.limitWarningText}>
                Limite de clientes atingido. Delete clientes ou assine o Premium para criar novos.
              </Text>
            )}
          </View>

          <View style={styles.limitRow}>
            <View style={styles.limitHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={styles.limitLabel}>Lançamentos no Mês</Text>
              </View>
              <Text style={styles.limitValue}>
                {txCount} / {subscription.max_transactions_per_month ?? 'Ilimitado'}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: subscription.max_transactions_per_month ? `${txPercent}%` : '100%',
                    backgroundColor: subscription.is_premium
                      ? '#10b981'
                      : txPercent >= 100
                      ? theme.colors.danger
                      : '#f59e0b',
                  },
                ]}
              />
            </View>
            {subscription.max_transactions_per_month && txCount >= subscription.max_transactions_per_month && (
              <Text style={styles.limitWarningText}>
                Limite mensal de lançamentos atingido. Faça upgrade para continuar registrando fiados.
              </Text>
            )}
          </View>
        </Card>

        {/* Upgrade Options OR Active Management */}
        {!subscription.is_premium ? (
          <View>
            <Text style={styles.sectionTitle}>Benefícios do Premium ⭐</Text>
            <Card style={styles.benefitsCard}>
              <View style={styles.benefitItem}>
                <View style={styles.benefitIconWrapper}>
                  <Ionicons name="infinite" size={18} color="#0369a1" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.benefitTitle}>Clientes Ilimitados</Text>
                  <Text style={styles.benefitDesc}>Cadastre quantos clientes precisar sem limites.</Text>
                </View>
              </View>

              <View style={styles.benefitItem}>
                <View style={styles.benefitIconWrapper}>
                  <Ionicons name="flash" size={18} color="#0369a1" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.benefitTitle}>Lançamentos Ilimitados</Text>
                  <Text style={styles.benefitDesc}>Registre fiados e pagamentos sem travas mensais.</Text>
                </View>
              </View>

              <View style={styles.benefitItem}>
                <View style={styles.benefitIconWrapper}>
                  <Ionicons name="document-text" size={18} color="#0369a1" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.benefitTitle}>Relatórios em PDF</Text>
                  <Text style={styles.benefitDesc}>Gere e envie extratos detalhados em PDF para seus clientes.</Text>
                </View>
              </View>

              <View style={styles.benefitItem}>
                <View style={styles.benefitIconWrapper}>
                  <Ionicons name="cloud-upload" size={18} color="#0369a1" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.benefitTitle}>Backup em Nuvem</Text>
                  <Text style={styles.benefitDesc}>Dados sincronizados com segurança e backup em tempo real.</Text>
                </View>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Adquira o Premium por apenas R$ 11,99/mês</Text>
            <Card style={styles.checkoutCard}>
              <View style={styles.googlePlayContainer}>
                <View style={styles.googlePlayHeader}>
                  <Ionicons name="logo-google-playstore" size={24} color="#10b981" />
                  <Text style={styles.googlePlayTitle}>Pagamento Seguro pelo Google Play</Text>
                </View>
                <Text style={styles.googlePlayDesc}>
                  Sua assinatura será processada com segurança e cobrada diretamente na sua conta do Google Play. 
                  Você pode gerenciar ou cancelar a qualquer momento nas configurações do seu celular.
                </Text>

                <Button
                  title={loading ? 'Processando Assinatura...' : 'Assinar com Google Play'}
                  variant="primary"
                  leftIcon={loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="logo-google" size={16} color="#fff" style={{ marginRight: 6 }} />}
                  disabled={loading}
                  onPress={handleUpgrade}
                  style={{ marginTop: 12, backgroundColor: '#10b981' }}
                />
              </View>
            </Card>
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Gerenciar Assinatura</Text>
            <Card style={styles.cancelCard}>
              <Text style={styles.cancelTitle}>Benefícios Premium Ativos</Text>
              <Text style={styles.cancelDesc}>
                Obrigado por apoiar o Faido! Sua conta possui acesso ilimitado a todos os recursos.
              </Text>
              <Button
                title="Cancelar Assinatura Premium"
                variant="ghost"
                onPress={handleCancelSubscription}
                style={{ borderColor: theme.colors.danger, marginTop: 8 }}
              />
            </Card>
          </View>
        )}


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
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  statusCard: {
    padding: 16,
  },
  premiumStatusCard: {
    borderColor: '#eab308',
    borderWidth: 1,
    backgroundColor: '#fffdf5',
  },
  planBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  planSubtitle: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '800',
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
  planDetailsContainer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
  },
  planDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  planDetailText: {
    fontSize: 13,
    color: theme.colors.textMain,
    marginLeft: 8,
  },
  limitsCard: {
    padding: 16,
  },
  limitRow: {
    marginBottom: 16,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  limitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  limitValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  limitWarningText: {
    fontSize: 11,
    color: theme.colors.danger,
    fontWeight: '600',
    marginTop: 4,
  },
  benefitsCard: {
    padding: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  benefitIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  benefitDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  googlePlayContainer: {
    padding: 8,
  },
  googlePlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  googlePlayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginLeft: 8,
  },
  googlePlayDesc: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  cancelCard: {
    padding: 16,
    alignItems: 'center',
  },
  cancelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginBottom: 6,
  },
  cancelDesc: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  sandboxCard: {
    padding: 16,
  },
  sandboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sandboxLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  sandboxDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  sandboxToggles: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sandboxSubTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
    marginBottom: 8,
  },
  sandboxButtonsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    padding: 4,
  },
  sandboxTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 4,
  },
  sandboxTabActive: {
    backgroundColor: '#ffffff',
  },
  sandboxTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  sandboxTabTextActive: {
    color: theme.colors.primary,
  },
  sandboxStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  sandboxStatusLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sourceBadgeLocal: {
    backgroundColor: '#ffedd5',
  },
  sourceBadgeCloud: {
    backgroundColor: '#dcfce7',
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sourceBadgeTextLocal: {
    color: '#ea580c',
  },
  sourceBadgeTextCloud: {
    color: '#15803d',
  },
});
