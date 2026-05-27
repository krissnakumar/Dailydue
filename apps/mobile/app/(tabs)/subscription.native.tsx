import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button } from '../../src/components';
import { useDailyDueStore } from '../../src/store';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useResponsive } from '../../src/utils/responsive';
import Constants from 'expo-constants';
import { useBilling } from '../../src/features/billing/hooks/useBilling';

const premiumSubId = process.env.EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID || '';
const androidPackageName = Constants.expoConfig?.android?.package || 'com.dailydue.app';

export default function SubscriptionNativeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const layout = useResponsive();
  const {
    subscription,
    getActiveCustomersCount,
    getCurrentMonthTransactionsCount,
  } = useDailyDueStore();

  const customersCount = getActiveCustomersCount();
  const txCount = getCurrentMonthTransactionsCount();
  const [inAppLoading, setInAppLoading] = useState(false);

  const billing = useBilling();

  useEffect(() => {
    if (!premiumSubId) return;
    if (!billing.connected) return;
    billing.fetchProducts([premiumSubId]).catch((err) => {
      console.warn('[Billing] Error fetching products:', err);
    });
  }, [billing.connected]);

  const premiumProduct = useMemo(() => {
    if (!premiumSubId) return null;
    return billing.subscriptions.find((s: any) => s?.id === premiumSubId) || null;
  }, [billing.subscriptions]);

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
      Alert.alert(t('subscription.googlePlayAlert'), t('subscription.cantOpenPlay'));
    }
  };

  const handleUpgrade = async () => {
    if (!premiumSubId) {
      Alert.alert(t('subscription.config'), t('subscription.setSubId'));
      return;
    }

    if (billing.isOffline) {
      Alert.alert(t('subscription.offlineMode'), t('subscription.offlineMessage'));
      return;
    }

    setInAppLoading(true);
    try {
      const success = await billing.handleUpgrade(premiumSubId, androidPackageName);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t('subscription.upgrade'), t('subscription.upgradeSuccess'));
      } else {
        Alert.alert(t('subscription.cancelError'), t('subscription.upgradeFailed'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('subscription.processFail'));
    } finally {
      setInAppLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!premiumSubId) {
      Alert.alert(t('subscription.config'), t('subscription.setSubId'));
      return;
    }
    setInAppLoading(true);
    try {
      const success = await billing.handleRestore(premiumSubId, androidPackageName);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t('subscription.restored'), t('subscription.restoreSuccess'));
      } else {
        Alert.alert(t('subscription.restorationTitle'), t('subscription.restoreFailed'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('subscription.restoreError'));
    } finally {
      setInAppLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Header
        showTotal={false}
        title={t('subscription.title')}
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
        <Text style={styles.sectionTitle}>{t('subscription.planAndLimits')}</Text>
        <Card style={styles.planCard}>
          <View style={styles.subHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name={subscription.is_premium ? 'diamond' : 'ribbon-outline'}
                size={20}
                color={subscription.is_premium ? '#eab308' : theme.colors.textMuted}
                style={{ marginRight: 8 }}
              />
              <View>
                <Text style={styles.subTitle}>
                  {subscription.plan_id === 'premium_monthly'
                    ? t('subscription.premiumPlan')
                    : t('subscription.freePlan')}
                </Text>
                <Text style={styles.subMeta}>
                  {t('subscription.source')}: {subscription.source === 'play' ? t('subscription.googlePlay') : subscription.source === 'cloud' ? t('subscription.cloud') : t('subscription.simulated')}
                  {billing.connected ? t('subscription.playOk') : t('subscription.playEllipsis')}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.badge,
                subscription.plan_id === 'premium_monthly'
                  ? styles.badgePremium
                  : styles.badgeFree,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  subscription.plan_id === 'premium_monthly'
                    ? styles.badgeTextPremium
                    : styles.badgeTextFree,
                ]}
              >{subscription.plan_id === 'premium_monthly'
                    ? t('subscription.premium')
                    : t('subscription.free')}
              </Text>
            </View>
          </View>

          <View style={styles.limitRow}>
            <View style={styles.limitHeader}>
              <Text style={styles.limitLabel}>{t('subscription.registeredCustomers')}</Text>
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
              <Text style={styles.limitLabel}>{t('subscription.monthlyTransactions')}</Text>
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

        <Text style={styles.sectionTitle}>{t('subscription.googlePlay')}</Text>
        <Card style={styles.googleCard}>
          <View style={styles.googlePlayHeader}>
            <Ionicons name="logo-google-playstore" size={22} color="#10b981" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.googlePlayTitle}>{t('subscription.premiumSub')}</Text>
              <Text style={styles.googlePlayDesc}>
                {premiumPriceLabel ? `${t('subscription.price')}: ${premiumPriceLabel}` : premiumSubId ? t('subscription.loadingPrice') : t('subscription.pendingConfig')}
              </Text>
            </View>
          </View>

          {!subscription.is_premium ? (
            <>
              <Button
                title={inAppLoading ? t('subscription.openingPlay') : t('subscription.subscribePlay')}
                variant="primary"
                leftIcon={
                  inAppLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="logo-google" size={16} color="#fff" style={{ marginRight: 6 }} />
                  )
                }
                disabled={inAppLoading}
                onPress={handleUpgrade}
                style={{ marginTop: 10, backgroundColor: '#10b981' }}
              />
              <Button title={t('subscription.restorePurchases')} variant="ghost" disabled={inAppLoading} onPress={handleRestore} style={{ marginTop: 10 }} />
            </>
          ) : (
            <>
              <Button
                title={t('subscription.managePlay')}
                variant="primary"
                leftIcon={<Ionicons name="open-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
                onPress={openPlayManageSubscriptions}
                style={{ marginTop: 10 }}
              />
              <Button
                title={t('subscription.restoreRevalidate')}
                variant="ghost"
                disabled={inAppLoading}
                onPress={handleRestore}
                style={{ marginTop: 10 }}
              />
            </>
          )}
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
  badgeBasic: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#bfdbfe',
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
  badgeTextBasic: {
    color: '#1d4ed8',
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
  sandboxPlanBtn: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: theme.colors.card,
  },
  sandboxPlanBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  sandboxPlanText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  sandboxPlanTextActive: {
    color: theme.colors.primary,
  },
});
