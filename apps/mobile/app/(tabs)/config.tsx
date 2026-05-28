import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Image, TouchableOpacity, Platform, KeyboardAvoidingView, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button } from '../../src/components';
import { useDailyDueStore } from '../../src/store';
import { useTheme } from '../../src/theme';
import { updateOwnerProfile, uploadOwnerProfilePicture } from '@dailydue/api';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useResponsive } from '../../src/utils/responsive';
import { SecurityService } from '../../src/core/security/security-service';
import { changeLanguage, getCurrentLanguage } from '../../src/core/i18n';
import Animated, { FadeInDown, FadeOutUp, Layout } from 'react-native-reanimated';

const BUSINESS_TYPES = [
  { id: 'mercado', labelKey: 'onboarding.businessMarket' },
  { id: 'padaria', labelKey: 'onboarding.businessBakery' },
  { id: 'bar', labelKey: 'onboarding.businessBar' },
  { id: 'petshop', labelKey: 'onboarding.businessPetshop' },
  { id: 'outro', labelKey: 'onboarding.businessOther' },
];

export default function ConfiguracoesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const layout = useResponsive();
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
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
    colorScheme,
    setColorScheme,
  } = useDailyDueStore();

  const customersCount = getActiveCustomersCount();
  const txCount = getCurrentMonthTransactionsCount();

  const [bizName, setBizName] = useState(businessConfig.businessName);
  const [pix, setPix] = useState(businessConfig.pixKey);
  const [phone, setPhone] = useState(businessConfig.phone);
  const [businessType, setBusinessType] = useState(businessConfig.businessType || 'mercado');
  const [overdueDays, setOverdueDays] = useState(Number(businessConfig.overdueDays || 15));
  const initialMethods = businessConfig.acceptedPaymentMethods || ['cash', 'upi', 'card'];
  const [methodCash, setMethodCash] = useState(initialMethods.includes('cash'));
  const [methodPix, setMethodPix] = useState(initialMethods.includes('upi') || initialMethods.includes('pix'));
  const [methodCard, setMethodCard] = useState(initialMethods.includes('card'));
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    businessConfig.whatsappTemplate ||
      t('config.whatsappDefaultTemplate')
  );
  const [showOnboardingDetails, setShowOnboardingDetails] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  
  const [userName, setUserName] = useState(user?.full_name || '');
  const [userPic, setUserPic] = useState(user?.picture || user?.avatar_url || '');
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());



  const isLocalPicture = (uri: string) =>
    uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('blob:') || uri.startsWith('data:image/');

  const handleSaveConfig = async () => {
    try {
      const acceptedMethods: string[] = [];
      if (methodCash) acceptedMethods.push('cash');
      if (methodPix) acceptedMethods.push('upi');
      if (methodCard) acceptedMethods.push('card');

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
        businessType,
        overdueDays: Math.max(1, overdueDays),
        acceptedPaymentMethods: acceptedMethods,
        whatsappTemplate: whatsappTemplate.trim(),
      });

      setUserPic(nextPicture);
      Alert.alert(t('common.success'), t('config.saveSuccess'));
    } catch (err) {
      console.warn('Erro ao atualizar perfil', err);
      Alert.alert(t('errors.generic'), t('config.saveError'));
    }
  };

  const handlePickPicture = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('config.permissionRequired'), t('config.galleryPermission'), [{ text: t('common.ok'), style: 'cancel' }]);
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

  const handleGoToLogin = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.wrapper}>
      <Header showTotal={false} title={t('config.appTitle')} />

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


        {/* Sync Failure History */}
        {failedSyncItems.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(220)}
            exiting={FadeOutUp.duration(180)}
            layout={Layout.springify().damping(18).stiffness(180)}
          >
            <Text style={styles.sectionTitle}>{t('config.syncHistory')}</Text>
            <Card style={styles.errorCard}>
              <View style={styles.errorHeader}>
                <Ionicons name="warning" size={20} color="#dc2626" />
                <Text style={styles.errorTitle}>{t('common.error')} ({failedSyncItems.length})</Text>
              </View>
              {failedSyncItems.map((item: any, idx) => {
                const errDetails = item.error_details || {};
                const errMsg = errDetails.message || item.failed_reason || t('config.unknownError');
                
                return (
                  <View key={item.id || idx} style={styles.errorItem}>
                    <Text style={styles.errorItemType}>
                      {item.type === 'create_customer' ? t('config.createCustomer') :
                       item.type === 'update_customer' ? t('config.updateCustomer') :
                       item.type === 'delete_customer' ? t('config.deleteCustomer') :
                       item.type === 'delete_transaction' ? t('config.deleteTransaction') :
                       item.type === 'debt' ? t('config.newSale') :
                       item.type === 'payment' ? t('config.newPayment') : item.type}
                    </Text>
                    <Text style={styles.errorItemMsg}>{errMsg}</Text>
                    {errDetails.code && (
                      <Text style={styles.errorItemCode}>{t('config.errorCode')} {errDetails.code}</Text>
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
                    Alert.alert(t('config.sync'), t('config.syncingPending'));
                  } catch (err: any) {
                    Alert.alert(t('common.error'), err.message || t('config.retryError'));
                  }
                }}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="refresh-outline" size={18} color="#fff" />
                )}
                <Text style={styles.retryErrorsBtnText}>
                  {isSyncing ? t('config.syncing') : t('config.retrySync')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearErrorsBtn}
                onPress={() => {
                  Alert.alert(
                    t('config.clearErrors'),
                    t('config.clearErrorsConfirm'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: () => useDailyDueStore.setState({ failedSyncItems: [] }),
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.clearErrorsBtnText}>{t('config.clearErrors')}</Text>
              </TouchableOpacity>
            </Card>
          </Animated.View>
        )}

        {/* Plano de Assinatura e Limites */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(40)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>{t('subscription.title')} & {t('subscription.plan')}</Text>
        <Card style={styles.subCard}>
          <View style={styles.subHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name={subscription.is_premium ? 'diamond' : 'ribbon-outline'}
                size={20}
                color={subscription.is_premium ? '#eab308' : theme.colors.textMuted}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.subTitle}>
                {subscription.plan_id === 'premium_monthly'
                  ? t('subscription.premiumPlan')
                  : t('subscription.freePlan')}
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
                  ? t('subscription.premium')
                  : t('subscription.free')}
              </Text>
            </View>
          </View>

          {/* Progress indicators */}
          <View style={styles.limitRow}>
            <View style={styles.limitHeader}>
              <Text style={styles.limitLabel}>{t('subscription.registeredCustomers')}</Text>
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
              <Text style={styles.limitLabel}>{t('subscription.monthlyTransactions')}</Text>
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
            title={t('config.managePlans')}
            variant="ghost"
            leftIcon={<Ionicons name="options-outline" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />}
            onPress={() => router.push('/subscription')}
            style={{ marginTop: 4 }}
          />
        </Card>
        </Animated.View>

        {/* Profile & Establishment Data */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(80)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>{t('config.profileEstablishment')}</Text>
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
                  <Text style={styles.label}>{t('login.nameLabel')}</Text>
                  <TextInput 
                    style={[styles.input, { height: 40, marginBottom: 0 }]} 
                    value={userName} 
                    onChangeText={setUserName} 
                    placeholder="Seu nome"
                  />
                </View>
              </View>
              <Text style={styles.profileEmail}>{t('config.accountAccess')}: {user.email}</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                <Ionicons name="warning-outline" size={16} color="#ca8a04" style={{ marginRight: 6 }} />
                <Text style={[styles.authWarnTitle, { marginBottom: 0 }]}>{t('config.localAccount')}</Text>
              </View>
              <Text style={styles.authWarnDesc}>{t('config.loginToBackup')}</Text>
              <Button
                title={t('config.createProfile')}
                variant="primary"
                onPress={handleGoToLogin}
                style={{ marginTop: 12, width: '100%' }}
              />
            </View>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('onboarding.businessName')}</Text>
            <TextInput style={styles.input} value={bizName} onChangeText={setBizName} />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('config.pixKey')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('config.pixKeyPlaceholder')}
              value={pix}
              onChangeText={setPix}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('clients.phone')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <View style={styles.compactOnboardingBox}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.compactHeader}
              onPress={() => setShowOnboardingDetails((prev) => !prev)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.compactOnboardingTitle}>{t('config.onboardingDetails')}</Text>
              </View>
              <Ionicons
                name={showOnboardingDetails ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>

            {showOnboardingDetails ? (
              <View style={styles.compactBody}>
                <View style={[styles.formGroup, styles.compactGroup]}>
                  <Text style={styles.label}>{t('onboarding.businessType')}</Text>
                  <View style={styles.typePillsWrap}>
                    {BUSINESS_TYPES.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.typePill, businessType === item.id && styles.typePillActive]}
                        onPress={() => setBusinessType(item.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.typePillText, businessType === item.id && styles.typePillTextActive]}>
                          {t(item.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.formGroup, styles.compactGroup]}>
                  <Text style={styles.label}>{t('onboarding.dueDays')}</Text>
                  <View style={styles.compactCounter}>
                    <TouchableOpacity
                      style={styles.counterBtn}
                      onPress={() => setOverdueDays(Math.max(1, overdueDays - 1))}
                    >
                      <Ionicons name="remove" size={16} color={theme.colors.textMain} />
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>{overdueDays}</Text>
                    <TouchableOpacity style={styles.counterBtn} onPress={() => setOverdueDays(overdueDays + 1)}>
                      <Ionicons name="add" size={16} color={theme.colors.textMain} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.formGroup, styles.compactGroup]}>
                  <Text style={styles.label}>{t('onboarding.paymentMethods')}</Text>
                  <View style={styles.methodsGrid}>
                    <View style={styles.methodRowCompact}>
                      <Text style={styles.methodLabel}>{t('payments.methodCash')}</Text>
                      <Switch value={methodCash} onValueChange={setMethodCash} trackColor={{ true: theme.colors.primary }} />
                    </View>
                    <View style={styles.methodRowCompact}>
                      <Text style={styles.methodLabel}>UPI</Text>
                      <Switch value={methodPix} onValueChange={setMethodPix} trackColor={{ true: theme.colors.primary }} />
                    </View>
                    <View style={styles.methodRowCompact}>
                      <Text style={styles.methodLabel}>{t('payments.methodCard')}</Text>
                      <Switch value={methodCard} onValueChange={setMethodCard} trackColor={{ true: theme.colors.primary }} />
                    </View>
                  </View>
                </View>

                <View style={[styles.formGroup, { marginBottom: 0 }]}>
                  <Text style={styles.label}>{t('onboarding.messageTemplate')}</Text>
                  <TextInput
                    style={[styles.input, styles.templateInput]}
                    multiline
                    numberOfLines={3}
                    value={whatsappTemplate}
                    onChangeText={setWhatsappTemplate}
                  />
                </View>
              </View>
            ) : null}
          </View>

          <Button
            title={t('config.saveChanges')}
            variant="accent"
            leftIcon={<Ionicons name="save-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
            onPress={handleSaveConfig}
            style={{ marginTop: 8 }}
          />
        </Card>
        </Animated.View>

        {/* Security */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(120)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>{t('config.securityTitle')}</Text>
        <Card style={styles.infoCard}>
          <View>
            {/* App Lock Master Switch */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.textMain }}>{t('config.securityLock')}</Text>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 }}>{t('config.securityDesc')}</Text>
              </View>
              <Switch
                value={!!isSystemLockEnabled}
                onValueChange={async (value) => {
                  if (value) {
                    const supported = await SecurityService.isSecuritySupportedAsync();
                    if (!supported) {
                      Alert.alert(
                        t('config.securityNotConfigured'),
                        t('config.securityNotConfiguredDesc'),
                        [{ text: t('common.ok') }]
                      );
                      return;
                    }
                    const auth = await SecurityService.authenticateAsync(t('config.securityActivate'));
                    if (auth.success) {
                      setIsSystemLockEnabled(true);
                      setIsBiometricsEnabled(true);
                      setAutoLockTimeout(180000); // 3 minutes timeout
                      Alert.alert(t('common.success'), t('config.securityActivated'));
                    }
                  } else {
                    const auth = await SecurityService.authenticateAsync(t('config.securityDeactivate'));
                    if (auth.success) {
                      setIsSystemLockEnabled(false);
                      setIsBiometricsEnabled(false);
                      setAutoLockTimeout(0);
                      Alert.alert(t('common.success'), t('config.securityDeactivated'));
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
                <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '600' }}>{t('config.securityDeviceProtected')}</Text>
              </View>
            )}
          </View>
        </Card>
        </Animated.View>

        {/* Appearance (Theme) */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(140)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>{t('config.theme')}</Text>
        <Card style={styles.infoCard}>
          <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 10 }}>{t('config.theme.desc')}</Text>
          <TouchableOpacity
            style={[styles.dropdownSelector, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}
            onPress={() => setShowThemeDropdown(!showThemeDropdown)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons
                name={
                  colorScheme === 'system'
                    ? 'phone-portrait-outline'
                    : colorScheme === 'light'
                    ? 'sunny-outline'
                    : 'moon-outline'
                }
                size={18}
                color={theme.colors.primary}
              />
              <Text style={[styles.dropdownSelectorText, { color: theme.colors.textMain }]}>
                {colorScheme === 'system'
                  ? t('config.theme.system')
                  : colorScheme === 'light'
                  ? t('config.theme.light')
                  : t('config.theme.dark')}
              </Text>
            </View>
            <Ionicons
              name={showThemeDropdown ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.textMuted}
            />
          </TouchableOpacity>

          {showThemeDropdown && (
            <View style={[styles.dropdownList, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, marginTop: 4 }]}>
              {[
                { id: 'system', label: t('config.theme.system'), icon: 'phone-portrait-outline' as const },
                { id: 'light', label: t('config.theme.light'), icon: 'sunny-outline' as const },
                { id: 'dark', label: t('config.theme.dark'), icon: 'moon-outline' as const },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.dropdownItem,
                    { borderBottomColor: theme.colors.border },
                    colorScheme === opt.id && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setColorScheme(opt.id as 'system' | 'light' | 'dark');
                    setShowThemeDropdown(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={colorScheme === opt.id ? theme.colors.primary : theme.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.dropdownItemText,
                        { color: theme.colors.textMain },
                        colorScheme === opt.id && styles.dropdownItemTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  {colorScheme === opt.id && (
                    <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>
        </Animated.View>

        {/* Idioma */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(160)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>{t('config.language')}</Text>
        <Card style={styles.infoCard}>
          <TouchableOpacity
            style={[styles.dropdownSelector, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}
            onPress={() => setShowLangDropdown(!showLangDropdown)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16 }}>
                {currentLang === 'en' ? '🇺🇸' : currentLang === 'hi' ? '🇮🇳' : '📖'}
              </Text>
              <Text style={[styles.dropdownSelectorText, { color: theme.colors.textMain }]}>
                {currentLang === 'en'
                  ? t('config.language.en')
                  : currentLang === 'hi'
                  ? t('config.language.hi')
                  : t('config.language.ta')}
              </Text>
            </View>
            <Ionicons
              name={showLangDropdown ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.textMuted}
            />
          </TouchableOpacity>

          {showLangDropdown && (
            <View style={[styles.dropdownList, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, marginTop: 4 }]}>
              {[
                { id: 'en', label: t('config.language.en'), flag: '🇺🇸' },
                { id: 'hi', label: t('config.language.hi'), flag: '🇮🇳' },
                { id: 'ta', label: t('config.language.ta'), flag: '📖' },
              ].map((lang) => (
                <TouchableOpacity
                  key={lang.id}
                  style={[
                    styles.dropdownItem,
                    { borderBottomColor: theme.colors.border },
                    currentLang === lang.id && styles.dropdownItemActive,
                  ]}
                  onPress={async () => {
                    await changeLanguage(lang.id as 'en' | 'hi' | 'ta');
                    setCurrentLang(lang.id);
                    setShowLangDropdown(false);
                    Alert.alert(
                      t('config.languageSelected'),
                      t('config.languageChangedTo', { language: lang.label })
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>{lang.flag}</Text>
                    <Text
                      style={[
                        styles.dropdownItemText,
                        { color: theme.colors.textMain },
                        currentLang === lang.id && styles.dropdownItemTextActive,
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </View>
                  {currentLang === lang.id && (
                    <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>
        </Animated.View>

        {/* System Information */}
        <Animated.View
          entering={FadeInDown.duration(220).delay(180)}
          layout={Layout.springify().damping(18).stiffness(180)}
        >
        <Text style={styles.sectionTitle}>{t('config.systemInfo')}</Text>
        <Card style={styles.infoCard}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={async () => {
              if (syncQueue.length === 0) {
                Alert.alert(
                  t('config.sync'),
                  t('config.syncComplete'),
                  [{ text: t('common.ok'), style: 'default' }]
                );
                return;
              }
              if (isSyncing) {
                Alert.alert(
                  t('config.syncInProgress'),
                  t('config.syncInProgressDesc'),
                  [{ text: t('common.ok'), style: 'default' }]
                );
                return;
              }
              Alert.alert(
                t('config.sync'),
                t('config.syncManualConfirm', { count: syncQueue.length }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('config.sync'),
                    style: 'default',
                    onPress: async () => {
                      try {
                        await attemptBackgroundSync();
                      } catch (err) {
                        Alert.alert(t('common.error'), t('config.syncError'));
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
              {t('config.syncQueue')} <Text style={{ fontWeight: 'bold' }}>{syncQueue.length} {t('config.pending')}</Text>
            </Text>
          </TouchableOpacity>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 3 }}>
            <Ionicons name="information-circle-outline" size={14} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.infoText, { marginVertical: 0 }]}>
              {t('config.appVersion')} <Text style={{ fontWeight: 'bold' }}>1.0.0</Text>
            </Text>
          </View>
          
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                t('config.privacyPolicy'),
                t('config.privacyPolicyDesc'),
                [{ text: t('common.ok'), style: 'default' }]
              );
            }}
            style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}
          >
            <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>{t('config.privacyPolicy')}</Text>
          </TouchableOpacity>
        </Card>
        </Animated.View>

      </ScrollView>


      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) => StyleSheet.create({
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
    marginBottom: 4,
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
  compactOnboardingBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#f8fafc',
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactOnboardingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  compactBody: {
    marginTop: 10,
  },
  compactGroup: {
    marginBottom: 8,
  },
  typePillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#ffffff',
  },
  typePillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  typePillTextActive: {
    color: '#ffffff',
  },
  compactCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  counterBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  methodsGrid: {
    gap: 2,
  },
  methodRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  methodLabel: {
    fontSize: 13,
    color: theme.colors.textMain,
  },
  templateInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 8,
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
  langPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    flex: 1,
    minWidth: 100,
    justifyContent: 'center',
  },
  langPillActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  langPillFlag: {
    fontSize: 18,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  langPillTextActive: {
    fontWeight: '800',
    color: theme.colors.primary,
  },
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    minHeight: 46,
    borderRadius: theme.borderRadius.sm,
  },
  dropdownSelectorText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMain,
    flex: 1,
    marginRight: 8,
  },
  dropdownList: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    marginTop: 4,
    ...theme.shadows.sm,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  dropdownItemActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textMain,
  },
  dropdownItemTextActive: {
    fontWeight: '700',
    color: theme.colors.primary,
  },
});
