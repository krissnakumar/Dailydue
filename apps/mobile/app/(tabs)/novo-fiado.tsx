import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { theme } from '../../src/theme';
import { useDailyDueStore } from '../../src/store';
import { useAdaptiveColors, useResponsive } from '../../src/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '../../src/core/i18n';
import { formatCurrency } from '../../src/utils';
import nativeNotifications from '../../src/core/native/notifications';

export default function NovoFiadoPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const layout = useResponsive();
  const colors = useAdaptiveColors();
  const insets = useSafeAreaInsets();

  const { customers, getSmartSuggestions, addDebt, subscription, getCurrentMonthTransactionsCount } = useDailyDueStore();

  const [selectedCustId, setSelectedCustId] = useState<string>('');
  const [descInput, setDescInput] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [reminderDays, setReminderDays] = useState<number | null>(null);

  useEffect(() => {
    const requested = typeof params.customerId === 'string' ? params.customerId : '';
    const initial = requested || (customers.length > 0 ? customers[0].id : '');
    setSelectedCustId(initial);
    setDescInput('');
    setAmountStr('');
    setShowSuggestions(false);
    setShowCustomerDropdown(false);
    setReminderDays(null);
  }, [params.customerId, customers]);

  const suggestions = useMemo(() => getSmartSuggestions(descInput), [getSmartSuggestions, descInput]);

  const handleChipSelect = (name: string, price: number) => {
    setDescInput(name);
    if (price > 0) setAmountStr(price.toFixed(2));
    setShowSuggestions(false);
  };

  const addQuickShortcut = (val: number) => {
    const current = parseFloat(amountStr) || 0;
    setAmountStr((current + val).toFixed(2));
  };

  const handleConfirmSubmit = () => {
    const amt = parseFloat(amountStr);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert(t('newFiado.errorTitle'), t('newFiado.enterAmount'), [{ text: t('common.ok') }], { cancelable: true });
      return;
    }

    if (!selectedCustId) {
      Alert.alert(t('newFiado.errorTitle'), t('newFiado.selectCustomer'), [{ text: t('common.ok') }], { cancelable: true });
      return;
    }

    if (
      !subscription.is_premium &&
      subscription.max_transactions_per_month !== null &&
      getCurrentMonthTransactionsCount() >= subscription.max_transactions_per_month
    ) {
      Alert.alert(
        t('payments.planLimitTitle'),
        t('newFiado.planLimitReached'),
        [
          { text: t('payments.later'), style: 'cancel' },
          {
            text: t('payments.seePlans'),
            onPress: () => {
              router.push('/subscription');
            },
          },
        ],
        { cancelable: true }
      );
      return;
    }

    const targetCust = customers.find((c) => c.id === selectedCustId);
    let finalDesc = descInput.trim() || t('newFiado.defaultDescription');

    if (reminderDays !== null) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + reminderDays);
      const dateStr = futureDate.toLocaleDateString(getDateLocale(), { day: '2-digit', month: '2-digit' });
      finalDesc += ` (Cobrar dia ${dateStr})`;
    }

    let dueDateStr: string | undefined = undefined;
    if (reminderDays !== null && reminderDays > 0) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + reminderDays);
      targetDate.setHours(9, 0, 0, 0);
      dueDateStr = targetDate.toISOString();
    }

    try {
      addDebt(selectedCustId, amt, finalDesc, dueDateStr);

      if (reminderDays !== null && reminderDays > 0) {
        void (async () => {
          try {
            const { status } = await nativeNotifications.requestPermissions();
            if (status === 'granted') {
              const targetDate = new Date();
              targetDate.setDate(targetDate.getDate() + reminderDays);
              targetDate.setHours(9, 0, 0, 0); // 9:00 AM on target day
              
              let triggerSeconds = Math.floor((targetDate.getTime() - Date.now()) / 1000);
              if (triggerSeconds <= 0) {
                triggerSeconds = reminderDays * 24 * 60 * 60; // Fallback
              }

              const title = t('notification.collectionTitle');
              const body = t('notification.collectionBody', {
                amount: formatCurrency(amt),
                name: targetCust?.full_name || 'Client',
              });

              await nativeNotifications.scheduleNotification(title, body, triggerSeconds, {
                tag: 'collection_reminder',
                customerId: selectedCustId,
                amount: amt,
              });
            }
          } catch (notifErr) {
            console.warn('[Notifications] Failed to schedule collection reminder:', notifErr);
          }
        })();
      }

      Alert.alert(
        t('newFiado.successTitle'),
        t('newFiado.successDesc', { amount: amt.toFixed(2), name: targetCust?.full_name.split(' ')[0] }),
        [{ text: t('common.ok') }],
        { cancelable: true }
      );
      router.back();
    } catch (err: any) {
      if (err.message === 'FREE_PLAN_TRANSACTION_LIMIT_REACHED') {
        Alert.alert(
          t('payments.planLimitTitle'),
          t('newFiado.planLimitReached'),
          [
            { text: t('payments.later'), style: 'cancel' },
            { text: t('payments.seePlans'), onPress: () => router.push('/subscription') },
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert(t('newFiado.errorTitle'), t('newFiado.errorDesc'), [{ text: t('common.ok') }], { cancelable: true });
      }
    }
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.topBarInner, { maxWidth: layout.formMaxWidth + layout.spacing.screen * 2 }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: colors.text }]}>{t('newFiado.title')}</Text>
          <View style={styles.topBarSpacer} />
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
          <View style={[styles.header, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('newFiado.quickEntry')}</Text>
            <Text style={styles.headerBadge}>{t('newFiado.counter5s')}</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{t('newFiado.selectClient')}</Text>
            <TouchableOpacity
              style={[styles.dropdownSelector, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]}
              onPress={() => setShowCustomerDropdown(!showCustomerDropdown)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownSelectorText, { color: colors.text }]} numberOfLines={1}>
                {selectedCustId ? customers.find((c) => c.id === selectedCustId)?.full_name || t('newFiado.selectOption') : t('newFiado.selectOption')}
              </Text>
              <Ionicons
                name={showCustomerDropdown ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>

            {showCustomerDropdown && (
              <View style={[styles.dropdownList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.dropdownCreateBtn}
                  onPress={() => {
                    setShowCustomerDropdown(false);
                    router.push('/clientes/novo?next=novo-fiado');
                  }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.dropdownCreateText}>{t('newFiado.registerClient')}</Text>
                </TouchableOpacity>

                {customers.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.dropdownItem, { borderBottomColor: colors.border }, selectedCustId === c.id && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedCustId(c.id);
                      setShowCustomerDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, { color: colors.text }, selectedCustId === c.id && styles.dropdownItemTextActive]} numberOfLines={1}>{c.full_name}</Text>
                    {selectedCustId === c.id && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{t('newFiado.whatItem')}</Text>
            <TextInput
              style={[styles.descInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
              placeholder={t('newFiado.searchItemPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={descInput}
              onChangeText={(txt) => {
                setDescInput(txt);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
            />

            {showSuggestions && suggestions.length > 0 && (
              <View style={[styles.suggestBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={s.name + i}
                    style={[styles.suggestRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleChipSelect(s.name, s.price)}
                  >
                    <Text style={[styles.suggestName, { color: colors.text }]} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.suggestPrice}>R$ {s.price.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.quickTagsWrap}>
              {suggestions.slice(0, 5).map((s, i) => (
                <TouchableOpacity key={'tag' + i} style={[styles.tagBtn, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]} onPress={() => handleChipSelect(s.name, s.price)}>
                  <Text style={[styles.tagBtnText, { color: colors.text }]} numberOfLines={1}>
                    {s.name} <Text style={{ opacity: 0.6 }}>R$ {s.price.toFixed(2)}</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{t('newFiado.purchaseAmount')}</Text>
            <TextInput
              style={[styles.amountDisplay, styles.amountText, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]}
              value={amountStr}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.,]/g, '').replace(',', '.');
                setAmountStr(cleaned);
              }}
              keyboardType="decimal-pad"
              placeholder={t('newFiado.amountPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
            />

            <View style={styles.shortcutsRow}>
              {[10, 20, 50, 100].map((val) => (
                <TouchableOpacity key={val} style={styles.shortcutBtn} onPress={() => addQuickShortcut(val)}>
                  <Text style={styles.shortcutText}>{t('newFiado.quickAdd', { amount: val })}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{t('newFiado.smartReminder')}</Text>
            <View style={styles.reminderRow}>
              <TextInput
                style={[styles.reminderInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
                placeholder={t('newFiado.reminderPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                value={reminderDays !== null ? String(reminderDays) : ''}
                onChangeText={(val) => {
                  const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(num)) setReminderDays(num);
                  else setReminderDays(null);
                }}
              />
            </View>
            {reminderDays !== null && (
              <Text style={styles.reminderFeedback}>
                {t('newFiado.reminderScheduled')}{' '}
                <Text style={{ fontWeight: '700', color: theme.colors.primary }}>
                  {(() => {
                    const d = new Date();
                    d.setDate(d.getDate() + reminderDays);
                    return d.toLocaleDateString(getDateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
                  })()}
                </Text>
              </Text>
            )}
          </View>

          <Button
            title={t('newFiado.confirmNow')}
            variant="accent"
            size="lg"
            leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
            onPress={handleConfirmSubmit}
            style={{ marginTop: 8 }}
          />
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
  topBarSpacer: {
    width: 44,
    height: 44,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.inputBg,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginRight: 8,
    flexShrink: 1,
  },
  headerBadge: {
    backgroundColor: '#ffedd5',
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMain,
    marginBottom: 8,
  },
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    minHeight: 38,
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    marginTop: 4,
    ...theme.shadows.sm,
  },
  dropdownCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: '#f8fafc',
  },
  dropdownCreateText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  dropdownItemActive: {
    backgroundColor: '#f0fdf4',
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
  descInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    minHeight: 38,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  suggestBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    marginTop: 4,
    maxHeight: 140,
    ...theme.shadows.sm,
  },
  suggestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  suggestName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  suggestPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  quickTagsScroll: {
    marginTop: 8,
    flexDirection: 'row',
  },
  quickTagsWrap: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagBtn: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  tagBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  amountDisplay: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  amountText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  reminderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reminderInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    flex: 1,
    minWidth: 140,
    fontSize: 13,
    color: theme.colors.textMain,
  },
  reminderFeedback: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  shortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    marginTop: 8,
  },
  shortcutBtn: {
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fed7aa',
    minHeight: 34,
    paddingHorizontal: 6,
    borderRadius: theme.borderRadius.sm,
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.accent,
  },
});
