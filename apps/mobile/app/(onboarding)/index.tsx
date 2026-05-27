import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  FadeInRight,
  FadeOutLeft,
  Layout,
} from 'react-native-reanimated';
import { useDailyDueStore } from '../../src/store';
import { theme } from '../../src/theme';
import { supabase, bootstrapOwnerProfile } from '@dailydue/api';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

const BUSINESS_TYPES = [
  { id: 'mercado', labelKey: 'onboarding.businessMarket', icon: 'cart-outline' },
  { id: 'padaria', labelKey: 'onboarding.businessBakery', icon: 'cafe-outline' },
  { id: 'bar', labelKey: 'onboarding.businessBar', icon: 'beer-outline' },
  { id: 'petshop', labelKey: 'onboarding.businessPetshop', icon: 'paw-outline' },
  { id: 'outro', labelKey: 'onboarding.businessOther', icon: 'grid-outline' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, updateBusinessConfig, addCustomer } = useDailyDueStore();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Personal Profile
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [profilePic, setProfilePic] = useState<string | null>(null);

  // Step 2: Business Profile
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [businessType, setBusinessType] = useState('mercado');

  // Step 3: Preferences
  const [overdueDays, setOverdueDays] = useState(15);
  const [methodCash, setMethodCash] = useState(true);
  const [methodPix, setMethodPix] = useState(true);
  const [methodCard, setMethodCard] = useState(true);
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    t('onboarding.whatsappDefaultTemplate')
  );

  // Step 4: First Customer
  const [firstCustName, setFirstCustName] = useState('');
  const [firstCustPhone, setFirstCustPhone] = useState('');

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('onboarding.accessDenied'), t('onboarding.accessDeniedPhoto'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset?.uri) {
        setProfilePic(asset.uri);
      }
    } catch (e) {
      console.warn('Image picker error:', e);
    }
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1) {
      if (!fullName.trim()) {
        Alert.alert(t('onboarding.ops'), t('onboarding.enterName'));
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!businessName.trim()) {
        Alert.alert(t('onboarding.ops'), t('onboarding.enterBusinessName'));
        return;
      }
      if (!businessPhone.trim() || businessPhone.replace(/\D/g, '').length < 10) {
        Alert.alert(t('onboarding.ops'), t('onboarding.enterValidWhatsApp'));
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async (skipFirstCustomer = false) => {
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // 1. Update Supabase User Metadata (if cloud user)
      if (user?.id && user.id !== 'usr_offline') {
        const { error: updateMetaErr } = await supabase.auth.updateUser({
          data: { full_name: fullName.trim() },
        });
        if (updateMetaErr) console.warn('Failed to update auth metadata:', updateMetaErr);

        // 2. Call bootstrapOwnerProfile RPC
        try {
          await bootstrapOwnerProfile({
            business_name: businessName.trim(),
            owner_name: fullName.trim(),
            phone: businessPhone.replace(/\D/g, ''),
          });
        } catch (rpcErr) {
          console.warn('Failed to call bootstrap RPC (possibly already bootstrapped):', rpcErr);
        }
      }

      // 3. Update Zustand businessConfig inside store
      const acceptedMethods: string[] = [];
      if (methodCash) acceptedMethods.push('cash');
      if (methodPix) acceptedMethods.push('upi');
      if (methodCard) acceptedMethods.push('card');

      updateBusinessConfig({
        businessName: businessName.trim(),
        pixKey: pixKey.trim(),
        phone: businessPhone.replace(/\D/g, ''),
        overdueDays,
        acceptedPaymentMethods: acceptedMethods,
        whatsappTemplate: whatsappTemplate.trim(),
        businessType,
      });

      // 4. Add First Customer (if filled)
      if (!skipFirstCustomer && firstCustName.trim()) {
        addCustomer(firstCustName.trim(), firstCustPhone.replace(/\D/g, ''));
      }

      // 5. Complete Onboarding
      useDailyDueStore.setState({ hasBootstrappedProfile: true });

      // 6. Navigate to Home Dashboard
      router.replace('/(tabs)/home');
    } catch (err: any) {
      console.error('[Onboarding] Error during completion:', err);
      Alert.alert(t('onboarding.errorSaving'), err?.message || t('onboarding.errorSavingDesc'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Branded progress */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Text style={styles.logoText}>{t('app.name')}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('onboarding.welcome').toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
        </View>
        <Text style={styles.stepIndicator}>{t('onboarding.step')} {step} {t('onboarding.of')} 4</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <Animated.View
            entering={FadeInRight.duration(200)}
            exiting={FadeOutLeft.duration(200)}
            layout={Layout.springify()}
            style={styles.card}
          >
            <Ionicons name="person-circle-outline" size={48} color={theme.colors.primary} style={styles.stepIcon} />
            <Text style={styles.title}>{t('onboarding.confirmProfile')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.profileDesc')}</Text>

            {/* Avatar Selector */}
            <TouchableOpacity style={styles.avatarContainer} onPress={pickPhoto} activeOpacity={0.8}>
              {profilePic ? (
                <Image source={{ uri: profilePic }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="camera-outline" size={28} color={theme.colors.primary} />
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="pencil" size={10} color="#ffffff" />
              </View>
            </TouchableOpacity>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('onboarding.yourFullName')} *</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.yourName')}
                placeholderTextColor={theme.colors.textMuted}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View
            entering={FadeInRight.duration(200)}
            exiting={FadeOutLeft.duration(200)}
            layout={Layout.springify()}
            style={styles.card}
          >
            <Ionicons name="storefront-outline" size={48} color={theme.colors.primary} style={styles.stepIcon} />
            <Text style={styles.title}>{t('onboarding.setupBusiness')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.businessDesc')}</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('onboarding.businessName')} *</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.businessNamePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                value={businessName}
                onChangeText={setBusinessName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('onboarding.whatsappPlaceholder')} *</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.whatsappPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="phone-pad"
                value={businessPhone}
                onChangeText={setBusinessPhone}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('onboarding.pixKey')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.pixKeyPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                value={pixKey}
                onChangeText={setPixKey}
              />
            </View>

            <Text style={[styles.label, { marginBottom: 8 }]}>{t('onboarding.businessType')}</Text>
            <View style={styles.businessTypeGrid}>
              {BUSINESS_TYPES.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.businessTypePill,
                    businessType === item.id && styles.businessTypePillActive,
                  ]}
                  onPress={() => setBusinessType(item.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={16}
                    color={businessType === item.id ? '#ffffff' : theme.colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.businessTypeLabel,
                      businessType === item.id && styles.businessTypeLabelActive,
                    ]}
                  >
                    {t(item.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {step === 3 && (
          <Animated.View
            entering={FadeInRight.duration(200)}
            exiting={FadeOutLeft.duration(200)}
            layout={Layout.springify()}
            style={styles.card}
          >
            <Ionicons name="options-outline" size={48} color={theme.colors.primary} style={styles.stepIcon} />
            <Text style={styles.title}>{t('onboarding.billingPreferences')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.billingDesc')}</Text>

            {/* Counter overdue days */}
            <View style={styles.preferenceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prefTitle}>{t('onboarding.dueDays')}</Text>
                <Text style={styles.prefDesc}>{t('onboarding.dueDaysDesc')}</Text>
              </View>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setOverdueDays(Math.max(1, overdueDays - 1))}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={16} color={theme.colors.textMain} />
                </TouchableOpacity>
                <Text style={styles.counterValue}>{overdueDays}</Text>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setOverdueDays(overdueDays + 1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={16} color={theme.colors.textMain} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Checkboxes for payment methods */}
            <Text style={styles.label}>{t('onboarding.paymentMethods')}</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('onboarding.cash')}</Text>
              <Switch
                value={methodCash}
                onValueChange={setMethodCash}
                trackColor={{ true: theme.colors.primary }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('onboarding.pix')}</Text>
              <Switch
                value={methodPix}
                onValueChange={setMethodPix}
                trackColor={{ true: theme.colors.primary }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('onboarding.card')}</Text>
              <Switch
                value={methodCard}
                onValueChange={setMethodCard}
                trackColor={{ true: theme.colors.primary }}
              />
            </View>

            <View style={[styles.inputContainer, { marginTop: 12 }]}>
              <Text style={styles.label}>{t('onboarding.messageTemplate')}</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                multiline
                numberOfLines={3}
                placeholder={t('onboarding.messageTemplatePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                value={whatsappTemplate}
                onChangeText={setWhatsappTemplate}
              />
              <Text style={styles.helpText}>{t('onboarding.messageHelpText')}</Text>
            </View>
          </Animated.View>
        )}

        {step === 4 && (
          <Animated.View
            entering={FadeInRight.duration(200)}
            exiting={FadeOutLeft.duration(200)}
            layout={Layout.springify()}
            style={styles.card}
          >
            <Ionicons name="diamond-outline" size={48} color={theme.colors.primary} style={styles.stepIcon} />
            <Text style={styles.title}>{t('onboarding.almostThere')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.lastStepDesc')}</Text>

            {/* Quick Tour Panel */}
            <View style={styles.tourWrapper}>
              <View style={styles.tourItem}>
                <View style={styles.tourIconCircle}>
                  <Ionicons name="person-add" size={16} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tourItemTitle}>{t('onboarding.tourAddCustomers')}</Text>
                  <Text style={styles.tourItemDesc}>{t('onboarding.tourAddCustomersDesc')}</Text>
                </View>
              </View>
              <View style={styles.tourItem}>
                <View style={styles.tourIconCircle}>
                  <Ionicons name="cash" size={16} color={theme.colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tourItemTitle}>{t('onboarding.tourRegisterFiados')}</Text>
                  <Text style={styles.tourItemDesc}>{t('onboarding.tourRegisterFiadosDesc')}</Text>
                </View>
              </View>
              <View style={styles.tourItem}>
                <View style={styles.tourIconCircle}>
                  <Ionicons name="logo-whatsapp" size={16} color={theme.colors.whatsapp} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tourItemTitle}>{t('onboarding.tourWhatsapp')}</Text>
                  <Text style={styles.tourItemDesc}>{t('onboarding.tourWhatsappDesc')}</Text>
                </View>
              </View>
            </View>

            {/* Add First Customer Form */}
            <View style={styles.firstCustomerWrap}>
              <Text style={styles.firstCustHeader}>{t('onboarding.firstCustomerHeader')}</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('onboarding.customerNameLabel')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.businessNamePlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={firstCustName}
                  onChangeText={setFirstCustName}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('onboarding.customerWhatsAppLabel')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('onboarding.whatsappPlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="phone-pad"
                  value={firstCustPhone}
                  onChangeText={setFirstCustPhone}
                />
              </View>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Navigation Buttons footer */}
      <View style={styles.footer}>
        {step > 1 ? (
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7} disabled={loading}>
            <Text style={styles.backButtonText}>{t('onboarding.back')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : step < 4 ? (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.8}>
            <Text style={styles.nextButtonText}>{t('onboarding.next')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 2, flexDirection: 'row', gap: 10 }}>
            {(!firstCustName.trim()) && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => handleComplete(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.skipButtonText}>{t('onboarding.skip')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.finishButton} onPress={() => handleComplete(false)} activeOpacity={0.8}>
              <Text style={styles.finishButtonText}>{t('onboarding.start')}</Text>
              <Ionicons name="diamond" size={16} color="#ffffff" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Outfit',
    color: theme.colors.primaryBrand,
    marginRight: 8,
  },
  badge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  progressBar: {
    height: 4,
    backgroundColor: theme.colors.inputBg,
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  stepIndicator: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: theme.borderRadius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.md,
  },
  stepIcon: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Outfit',
    color: theme.colors.textMain,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  avatarContainer: {
    alignSelf: 'center',
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 24,
    position: 'relative',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: theme.colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 44,
    paddingHorizontal: 16,
    fontSize: 14,
    color: theme.colors.textMain,
  },
  multilineInput: {
    height: 80,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  businessTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  businessTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#ffffff',
  },
  businessTypePillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  businessTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  businessTypeLabelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: 16,
  },
  prefTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  prefDesc: {
    fontSize: 11.5,
    color: theme.colors.textMuted,
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  counterBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Outfit',
    paddingHorizontal: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  tourWrapper: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tourItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tourIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  tourItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  tourItemDesc: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  firstCustomerWrap: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 16,
  },
  firstCustHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textMain,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  backButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  nextButton: {
    flex: 1.5,
    backgroundColor: theme.colors.primary,
    height: 46,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '800',
  },
  finishButton: {
    flex: 2,
    backgroundColor: theme.colors.primary,
    height: 46,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '800',
  },
  skipButton: {
    flex: 1,
    height: 46,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  skipButtonText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  loaderContainer: {
    flex: 1.5,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
