import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, Switch, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useResponsive } from '../../src/utils/responsive';
import Constants from 'expo-constants';
import { verifyGooglePlaySubscription } from '@controle-fiado/api';

const premiumSubId = process.env.EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID || '';
const androidPackageName = Constants.expoConfig?.android?.package || 'br.com.controlefiado.app';

function extractPurchaseToken(purchase: any): string | null {
  const direct = purchase?.purchaseToken || purchase?.transactionReceipt?.purchaseToken || purchase?.dataAndroid?.purchaseToken;
  if (direct) return String(direct);

  const receipt = purchase?.transactionReceipt || purchase?.dataAndroid;
  if (typeof receipt === 'string') {
    try {
      const parsed = JSON.parse(receipt);
      return parsed?.purchaseToken || parsed?.token || null;
    } catch {
      return null;
    }
  }

  return null;
}

export default function SubscriptionNativeScreen() {
  const router = useRouter();
  const layout = useResponsive();
  const {
    subscription,
    getActiveCustomersCount,
    getCurrentMonthTransactionsCount,
    toggleSubscriptionSimulation,
    fetchSubscription,
  } = useFiadoStore();

  const customersCount = getActiveCustomersCount();
  const txCount = getCurrentMonthTransactionsCount();
  const [loading, setLoading] = useState(false);

  const isSimulated = subscription.is_simulated;

  let useIAPHook: any = null;
  const isExpoGo = Constants.appOwnership === 'expo';
  if (!isExpoGo) {
    try {
      // Lazy-load native-only dependency so the screen can render a helpful message
      // when the dev client wasn't rebuilt after installing IAP deps.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      useIAPHook = require('react-native-iap')?.useIAP;
    } catch {
      useIAPHook = null;
    }
  }

  if (!useIAPHook) {
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
        >
          <Card style={styles.googleCard}>
            <Text style={styles.googlePlayTitle}>Google Play Billing indisponível</Text>
            <Text style={styles.googlePlayDesc}>
              {isExpoGo
                ? 'Assinaturas do Google Play não rodam no Expo Go. Use um development build ou AAB.'
                : 'Refaça o build do app Android (dev client / AAB) após instalar as dependências de billing.'}
            </Text>
            <Button title="Ver instruções" variant="ghost" onPress={() => router.push('/config')} style={{ marginTop: 10 }} />
          </Card>
        </ScrollView>
      </View>
    );
  }

  const verifyAndRefresh = async (purchase: any) => {
    if (!premiumSubId || purchase?.productId !== premiumSubId) return false;

    const purchaseToken = extractPurchaseToken(purchase);
    if (!purchaseToken) {
      Alert.alert('Google Play', 'Não consegui ler o token da compra. Tente restaurar a assinatura em alguns segundos.');
      return false;
    }

    const result = await verifyGooglePlaySubscription({
      packageName: androidPackageName,
      productId: premiumSubId,
      purchaseToken,
    });

    await fetchSubscription();
    return Boolean(result?.is_premium);
  };

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    restorePurchases,
    getAvailablePurchases,
  } = useIAPHook({
    onPurchaseSuccess: async (purchase: any) => {
      try {
        if (!premiumSubId || purchase.productId !== premiumSubId) return;
        const active = await verifyAndRefresh(purchase);
        if (!active) {
          Alert.alert('Assinatura', 'Compra recebida, mas o Google Play ainda não confirmou uma assinatura ativa.');
          return;
        }
        await finishTransaction({ purchase, isConsumable: false });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Assinatura Ativada', 'Pagamento confirmado pelo Google Play. Premium liberado!');
      } catch (e) {
        console.warn('[IAP] purchase verification failed:', e);
        Alert.alert('Validação pendente', 'Não foi possível validar a compra no servidor agora. Tente restaurar em alguns segundos.');
      }
    },
    onPurchaseError: (e: any) => {
      const msg = (e as any)?.message || 'Falha ao processar a compra pelo Google Play.';
      Alert.alert('Ops!', msg);
    },
  });

  useEffect(() => {
    if (!premiumSubId) return;
    if (!connected) return;
    fetchProducts({ skus: [premiumSubId], type: 'subs' });
  }, [connected, fetchProducts]);

  const premiumProduct = useMemo(() => {
    if (!premiumSubId) return null;
    return subscriptions.find((s: any) => s?.id === premiumSubId) || null;
  }, [subscriptions]);

  const premiumPriceLabel =
    (premiumProduct as any)?.displayPrice ||
    (premiumProduct as any)?.subscriptionOffers?.[0]?.displayPrice ||
    (premiumProduct as any)?.subscriptionOfferDetailsAndroid?.[0]?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice ||
    '';

  const customersPercent = subscription.max_customers ? Math.min(100, (customersCount / subscription.max_customers) * 100) : 0;
  const txPercent = subscription.max_transactions_per_month ? Math.min(100, (txCount / subscription.max_transactions_per_month) * 100) : 0;

  const openPlayManageSubscriptions = async () => {
    try {
      await Linking.openURL('https://play.google.com/store/account/subscriptions');
    } catch {
      Alert.alert('Google Play', 'Não foi possível abrir o Google Play neste dispositivo.');
    }
  };

  const handleUpgrade = async () => {
    if (!premiumSubId) {
      Alert.alert('Configuração', 'Defina EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID para habilitar assinatura via Google Play.');
      return;
    }
    if (!connected) {
      Alert.alert('Google Play', 'Conectando ao Google Play… tente novamente em alguns segundos.');
      return;
    }

    const offerToken =
      (premiumProduct as any)?.subscriptionOffers?.[0]?.offerTokenAndroid ||
      (premiumProduct as any)?.subscriptionOfferDetailsAndroid?.[0]?.offerToken ||
      '';

    if (!offerToken) {
      Alert.alert('Google Play', 'Não encontrei uma oferta ativa. Crie Base Plan/Offer no Play Console.');
      return;
    }

    setLoading(true);
    try {
      await requestPurchase({
        type: 'subs',
        request: {
          google: { skus: [premiumSubId], subscriptionOffers: [{ sku: premiumSubId, offerToken }] },
        },
      } as any);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!premiumSubId) {
      Alert.alert('Configuração', 'Defina EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID para restaurar compras.');
      return;
    }
    setLoading(true);
    try {
      await restorePurchases({ includeSuspendedAndroid: true });
      const availablePurchases =
        typeof getAvailablePurchases === 'function'
          ? await getAvailablePurchases({ onlyIncludeActiveItemsAndroid: true })
          : [];
      const premiumPurchase = (availablePurchases || []).find((purchase: any) => purchase?.productId === premiumSubId);

      if (premiumPurchase) {
        const active = await verifyAndRefresh(premiumPurchase);
        Alert.alert('Restaurado', active ? 'Assinatura ativa confirmada.' : 'Nenhuma assinatura ativa foi confirmada pelo servidor.');
        return;
      }

      await fetchSubscription();
      Alert.alert('Restaurado', 'Plano revalidado pela nuvem. Se a assinatura acabou de ser comprada, tente novamente em alguns segundos.');
    } catch (e: any) {
      Alert.alert('Ops!', e?.message || 'Falha ao restaurar compras.');
    } finally {
      setLoading(false);
    }
  };

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
      >
        <Text style={styles.sectionTitle}>Plano e limites</Text>
        <Card style={styles.planCard}>
          <View style={styles.subHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name={subscription.is_premium ? 'sparkles' : 'ribbon-outline'}
                size={20}
                color={subscription.is_premium ? '#eab308' : theme.colors.textMuted}
                style={{ marginRight: 8 }}
              />
              <View>
                <Text style={styles.subTitle}>{subscription.is_premium ? 'Plano Premium' : 'Plano Gratuito'}</Text>
                <Text style={styles.subMeta}>
                  Fonte: {subscription.source === 'play' ? 'Google Play' : subscription.source === 'cloud' ? 'Nuvem' : 'Simulado'}
                  {connected ? ' • Play OK' : ' • Play…'}
                </Text>
              </View>
            </View>
            <View style={[styles.badge, subscription.is_premium ? styles.badgePremium : styles.badgeFree]}>
              <Text style={[styles.badgeText, subscription.is_premium ? styles.badgeTextPremium : styles.badgeTextFree]}>
                {subscription.is_premium ? 'Premium' : 'Básico'}
              </Text>
            </View>
          </View>

          <View style={styles.limitRow}>
            <View style={styles.limitHeader}>
              <Text style={styles.limitLabel}>Clientes cadastrados</Text>
              <Text style={styles.limitValue}>
                {customersCount} / {subscription.max_customers ?? '∞'}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: subscription.max_customers ? `${customersPercent}%` : '100%',
                    backgroundColor: subscription.is_premium
                      ? theme.colors.primary
                      : subscription.max_customers !== null && customersCount >= subscription.max_customers
                      ? theme.colors.danger
                      : theme.colors.accent,
                  },
                ]}
              />
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
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: subscription.max_transactions_per_month ? `${txPercent}%` : '100%',
                    backgroundColor: subscription.is_premium
                      ? theme.colors.primary
                      : subscription.max_transactions_per_month !== null && txCount >= subscription.max_transactions_per_month
                      ? theme.colors.danger
                      : theme.colors.accent,
                  },
                ]}
              />
            </View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Google Play</Text>
        <Card style={styles.googleCard}>
          <View style={styles.googlePlayHeader}>
            <Ionicons name="logo-google-playstore" size={22} color="#10b981" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.googlePlayTitle}>Assinatura Premium</Text>
              <Text style={styles.googlePlayDesc}>
                {premiumPriceLabel ? `Preço: ${premiumPriceLabel}` : premiumSubId ? 'Carregando preço…' : 'Configuração pendente'}
              </Text>
            </View>
          </View>

          {!subscription.is_premium ? (
            <>
              <Button
                title={loading ? 'Abrindo Google Play…' : 'Assinar com Google Play'}
                variant="primary"
                leftIcon={
                  loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="logo-google" size={16} color="#fff" style={{ marginRight: 6 }} />
                  )
                }
                disabled={loading}
                onPress={handleUpgrade}
                style={{ marginTop: 10, backgroundColor: '#10b981' }}
              />
              <Button title="Restaurar compras" variant="ghost" disabled={loading} onPress={handleRestore} style={{ marginTop: 10 }} />
            </>
          ) : (
            <>
              <Button
                title="Gerenciar assinatura no Google Play"
                variant="primary"
                leftIcon={<Ionicons name="open-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
                onPress={openPlayManageSubscriptions}
                style={{ marginTop: 10 }}
              />
              <Button
                title="Restaurar / revalidar Premium"
                variant="ghost"
                disabled={loading}
                onPress={handleRestore}
                style={{ marginTop: 10 }}
              />
            </>
          )}
        </Card>

        <Text style={styles.sectionTitle}>Sandbox (debug)</Text>
        <Card style={styles.sandboxCard}>
          <View style={styles.sandboxRow}>
            <Text style={styles.sandboxLabel}>Ativar simulação (sem cobrança)</Text>
            <Switch value={isSimulated} onValueChange={(val) => toggleSubscriptionSimulation(val)} />
          </View>
          <Text style={styles.sandboxHint}>Útil para testar telas Premium sem pagar. (Apenas local)</Text>
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
  backBtn: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textMain,
    marginTop: 14,
    marginBottom: 10,
  },
  planCard: {
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
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  subMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgePremium: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  badgeFree: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeTextPremium: {
    color: '#b45309',
  },
  badgeTextFree: {
    color: theme.colors.textMuted,
  },
  limitRow: {
    marginBottom: 14,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  limitLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  limitValue: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  googleCard: {
    padding: 16,
  },
  googlePlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googlePlayTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.textMain,
  },
  googlePlayDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  sandboxCard: {
    padding: 16,
  },
  sandboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sandboxLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  sandboxHint: {
    marginTop: 8,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
});
