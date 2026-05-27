import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../../../src/components/Button';
import { useDailyDueStore } from '../../../src/store';
import { theme } from '../../../src/theme';
import { useAdaptiveColors, useResponsive } from '../../../src/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function NovoClientePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ next?: string }>();
  const layout = useResponsive();
  const colors = useAdaptiveColors();
  const insets = useSafeAreaInsets();

  const { addCustomer, subscription, getActiveCustomersCount } = useDailyDueStore();
  const customersCount = getActiveCustomersCount();

  useEffect(() => {
    if (subscription.max_customers !== null && customersCount >= subscription.max_customers) {
      Alert.alert(
        t('clients.limitFreePlanTitle'),
        t('clients.limitFreePlanDesc'),
        [
          { text: t('clients.back'), onPress: () => router.back(), style: 'cancel' },
          { text: t('clients.seePlans'), onPress: () => router.replace('/subscription') },
        ],
        { cancelable: false }
      );
    }
  }, [subscription, customersCount]);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCep, setNewCep] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPicture, setNewPicture] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [cepStatus, setCepStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  const formatPhoneValue = (val: string) => {
    let clean = val.replace(/\D/g, '');
    if (clean.length > 11) clean = clean.substring(0, 11);
    if (clean.length === 0) return '';
    if (clean.length <= 2) return `(${clean}`;
    if (clean.length <= 6) return `(${clean.substring(0, 2)}) ${clean.substring(2)}`;
    if (clean.length <= 10) return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`;
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`;
  };

  const handlePhoneChange = (val: string) => {
    setNewPhone(formatPhoneValue(val));
  };

  const handleCepChange = (val: string) => {
    const formatted = val.replace(/\D/g, '').substring(0, 8);
    setNewCep(formatted);
    if (!formatted.length) setCepStatus('idle');
    else setCepStatus(formatted.length === 6 ? 'valid' : 'invalid');
  };

  const pickCustomerPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('clients.noPermission'), t('clients.noPermissionDesc'), [{ text: t('common.ok') }], { cancelable: true });
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
      if (!asset?.uri) return;
      setNewPicture(asset.uri);
    } catch {
      Alert.alert(t('clients.opsTitle'), t('clients.loadError'), [{ text: t('common.ok') }], { cancelable: true });
    }
  };

  const handleCreateSubmit = () => {
    const name = newName.trim();
    const phoneDigits = (newPhone || '').replace(/\D/g, '');
    const cepDigits = (newCep || '').replace(/\D/g, '');

    if (!name || name.length < 2) {
      Alert.alert(t('clients.opsTitle'), t('clients.missingName'), [{ text: t('common.ok') }], { cancelable: true });
      return;
    }

    if (phoneDigits && !(phoneDigits.length === 10 || phoneDigits.length === 11)) {
      Alert.alert(t('clients.opsTitle'), t('clients.invalidPhone'), [{ text: t('common.ok') }], { cancelable: true });
      return;
    }

    if (cepDigits && cepDigits.length !== 6) {
      Alert.alert(t('clients.opsTitle'), 'PIN code must have 6 digits.', [{ text: t('common.ok') }], { cancelable: true });
      return;
    }

    setSaving(true);
    try {
      const newCust = addCustomer(name, phoneDigits, cepDigits, newAddress.trim(), undefined, '', newPicture, newNotes.trim());

      Alert.alert(t('clients.registeredSuccess'), t('clients.registeredDesc', { name }), [{ text: t('common.ok') }], { cancelable: true });

      const next = typeof params.next === 'string' ? params.next : '';
      if (next === 'novo-fiado') {
        router.replace(`/novo-fiado?customerId=${newCust.id}`);
      } else {
        router.back();
      }
    } catch (e: any) {
      if (e.message === 'FREE_PLAN_CUSTOMER_LIMIT_REACHED') {
        Alert.alert(
          t('clients.limitFreePlanTitle'),
          t('clients.limitFreePlanDesc'),
          [
            { text: t('clients.later'), style: 'cancel' },
            { text: t('clients.seePlans'), onPress: () => router.push('/subscription') },
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert(t('clients.opsTitle'), t('clients.saveError'), [{ text: t('common.ok') }], { cancelable: true });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.topBarInner, { maxWidth: layout.formMaxWidth + layout.spacing.screen * 2 }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: colors.text }]}>{t('clients.newClient')}</Text>
          <TouchableOpacity onPress={() => router.push('/subscription')} style={styles.badgeBtn} activeOpacity={0.7}>
            <View style={styles.badge}>
              <Ionicons name={subscription.is_premium ? 'star' : 'leaf'} size={10} color="#fff" />
              <Text style={styles.badgeText}>{subscription.is_premium ? t('clients.pro') : t('clients.free')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              maxWidth: layout.formMaxWidth,
              alignSelf: 'center',
              width: '100%',
              paddingHorizontal: layout.spacing.screen,
              paddingBottom: layout.spacing.xl + insets.bottom + 24,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.photoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.photoRow}>
              <View style={[styles.photoPreview, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]}>
                {newPicture ? (
                  <Image source={{ uri: newPicture }} style={styles.photoPreviewImg} />
                ) : (
                  <Ionicons name="camera-outline" size={26} color={theme.colors.textMuted} />
                )}
                <View style={styles.photoBadge}>
                  <Ionicons name={newPicture ? 'checkmark' : 'add'} size={11} color="#ffffff" />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('clients.customerPhoto')}</Text>
                <View style={styles.photoActions}>
                  <TouchableOpacity
                    style={[styles.photoBtn, styles.photoBtnPrimary]}
                    onPress={pickCustomerPhoto}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="images-outline" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={[styles.photoBtnText, styles.photoBtnTextPrimary]}>
                      {newPicture ? t('clients.photoBtnChange') : t('clients.photoBtnChoose')}
                    </Text>
                  </TouchableOpacity>
                  {newPicture ? (
                    <TouchableOpacity style={[styles.photoBtn, styles.photoBtnDanger]} onPress={() => setNewPicture('')} activeOpacity={0.8}>
                      <Ionicons name="trash-outline" size={14} color={theme.colors.dangerText} style={{ marginRight: 6 }} />
                      <Text style={[styles.photoBtnText, styles.photoBtnTextDanger]}>{t('clients.photoBtnRemove')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={styles.helperText}>{t(newPicture ? 'clients.photoSelected' : 'clients.photoHelper')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Nome *</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
              placeholder={t('clients.namePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, styles.formCol]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>{t('clients.whatsapp')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
                placeholder="(11) 99999-9999"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={handlePhoneChange}
              />
            </View>
            <View style={[styles.formGroup, styles.formCol]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.formLabel, { color: colors.text }]}>PIN Code</Text>
                {cepStatus === 'valid' && <Text style={{ fontSize: 11, color: '#059669', fontWeight: '500' }}>{t('clients.statusCepValid')} ✓</Text>}
                {cepStatus === 'invalid' && <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '500' }}>{t('clients.nonExistent')} ✗</Text>}
              </View>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
                placeholder="560001"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                value={newCep}
                onChangeText={handleCepChange}
              />
            </View>
          </View>



          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>{t('clients.address')}</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
              placeholder={t('clients.addressPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={newAddress}
              onChangeText={setNewAddress}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>{t('clients.notes')}</Text>
            <TextInput
              style={[
                styles.formInput, 
                { 
                  backgroundColor: colors.mutedSurface, 
                  borderColor: colors.border, 
                  color: colors.text,
                  minHeight: 80,
                  textAlignVertical: 'top',
                  paddingVertical: 10,
                }
              ]}
              placeholder={t('clients.notesPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
              numberOfLines={3}
            />
          </View>

          <Button
            title={saving ? t('common.loading') : t('clients.register')}
            variant="primary"
            size="lg"
            leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
            onPress={handleCreateSubmit}
            disabled={saving}
            style={{ marginTop: 8 }}
          />
          {subscription.max_customers !== null ? (
            <Text style={styles.limitText}>
              {t('clients.planLimitText', { current: getActiveCustomersCount(), max: subscription.max_customers })}
            </Text>
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
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  topBarInner: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  badgeBtn: {
    paddingLeft: 6,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 4,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 12,
  },
  photoCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    marginBottom: 16,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  photoPreviewImg: {
    width: '100%',
    height: '100%',
  },
  photoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  photoBtn: {
    paddingHorizontal: 10,
    minHeight: 38,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  photoBtnDanger: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  photoBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  photoBtnTextPrimary: {
    color: '#ffffff',
  },
  photoBtnTextDanger: {
    color: theme.colors.dangerText,
  },
  helperText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 15,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  formCol: {
    flexGrow: 1,
    flexBasis: 220,
  },
  radioRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  radioButton: {
    paddingHorizontal: 16,
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  radioText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  radioTextActive: {
    color: '#ffffff',
  },
  limitText: {
    marginTop: 10,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
