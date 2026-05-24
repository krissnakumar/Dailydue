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
import { useFiadoStore } from '../../src/store';

export default function NovoFiadoPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();

  const { customers, getSmartSuggestions, addDebt, subscription, getCurrentMonthTransactionsCount } = useFiadoStore();

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
      Alert.alert('Ops!', 'Qual o valor da compra? 💰', [{ text: 'OK' }], { cancelable: true });
      return;
    }

    if (!selectedCustId) {
      Alert.alert('Ops!', 'Para quem é essa anotação? Selecione um cliente. 👤', [{ text: 'OK' }], { cancelable: true });
      return;
    }

    if (
      !subscription.is_premium &&
      subscription.max_transactions_per_month !== null &&
      getCurrentMonthTransactionsCount() >= subscription.max_transactions_per_month
    ) {
      Alert.alert(
        'Plano Básico 🔒',
        'Limite de lançamentos do mês atingido. Mude para o Premium!',
        [
          { text: 'Depois', style: 'cancel' },
          {
            text: 'Ver Planos',
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
    let finalDesc = descInput.trim() || 'Fiado / Balcão';

    if (reminderDays !== null) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + reminderDays);
      const dateStr = futureDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      finalDesc += ` (Cobrar dia ${dateStr})`;
    }

    try {
      addDebt(selectedCustId, amt, finalDesc);

      Alert.alert(
        'Pronto! 🎉',
        `Anotação de R$ ${amt.toFixed(2)} salva para ${targetCust?.full_name.split(' ')[0]}!`,
        [{ text: 'OK' }],
        { cancelable: true }
      );
      router.back();
    } catch (err: any) {
      if (err.message === 'FREE_PLAN_TRANSACTION_LIMIT_REACHED') {
        Alert.alert(
          'Plano Básico 🔒',
          'Limite de lançamentos atingido. Mude para o Premium!',
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Ver Planos', onPress: () => router.push('/subscription') },
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert('Eita!', 'Não conseguimos salvar agora. Tente de novo! 😅', [{ text: 'OK' }], { cancelable: true });
      }
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Novo Fiado</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Lançamento Rápido</Text>
            <Text style={styles.headerBadge}>Balcão em 5s</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>1. Selecione o Cliente *</Text>
            <TouchableOpacity
              style={styles.dropdownSelector}
              onPress={() => setShowCustomerDropdown(!showCustomerDropdown)}
              activeOpacity={0.8}
            >
              <Text style={styles.dropdownSelectorText}>
                {selectedCustId ? customers.find((c) => c.id === selectedCustId)?.full_name || 'Selecione um…' : 'Selecione um…'}
              </Text>
              <Ionicons
                name={showCustomerDropdown ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>

            {showCustomerDropdown && (
              <View style={styles.dropdownList}>
                <TouchableOpacity
                  style={styles.dropdownCreateBtn}
                  onPress={() => {
                    setShowCustomerDropdown(false);
                    router.push('/clientes/novo?next=novo-fiado');
                  }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.dropdownCreateText}>Cadastrar Novo Cliente</Text>
                </TouchableOpacity>

                {customers.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.dropdownItem, selectedCustId === c.id && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedCustId(c.id);
                      setShowCustomerDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selectedCustId === c.id && styles.dropdownItemTextActive]}>{c.full_name}</Text>
                    {selectedCustId === c.id && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>2. O que levou?</Text>
            <TextInput
              style={styles.descInput}
              placeholder="Digite para buscar ou adicionar item..."
              placeholderTextColor={theme.colors.textMuted}
              value={descInput}
              onChangeText={(txt) => {
                setDescInput(txt);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
            />

            {showSuggestions && suggestions.length > 0 && (
              <View style={styles.suggestBox}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={s.name + i}
                    style={styles.suggestRow}
                    onPress={() => handleChipSelect(s.name, s.price)}
                  >
                    <Text style={styles.suggestName}>{s.name}</Text>
                    <Text style={styles.suggestPrice}>R$ {s.price.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickTagsScroll} keyboardShouldPersistTaps="handled">
              {suggestions.slice(0, 5).map((s, i) => (
                <TouchableOpacity key={'tag' + i} style={styles.tagBtn} onPress={() => handleChipSelect(s.name, s.price)}>
                  <Text style={styles.tagBtnText}>
                    {s.name} <Text style={{ opacity: 0.6 }}>R$ {s.price.toFixed(2)}</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>3. Valor da Compra (R$) *</Text>
            <TextInput
              style={[styles.amountDisplay, styles.amountText]}
              value={amountStr}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.,]/g, '').replace(',', '.');
                setAmountStr(cleaned);
              }}
              keyboardType="decimal-pad"
              placeholder="R$ 0.00"
              placeholderTextColor={theme.colors.textMuted}
            />

            <View style={styles.shortcutsRow}>
              {[10, 20, 50, 100].map((val) => (
                <TouchableOpacity key={val} style={styles.shortcutBtn} onPress={() => addQuickShortcut(val)}>
                  <Text style={styles.shortcutText}>+ R$ {val}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Lembrete Inteligente (Dias para Cobrança)</Text>
            <View style={styles.reminderRow}>
              <TextInput
                style={styles.reminderInput}
                placeholder="Quantos dias até a cobrança?"
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
                Cobrança agendada para:{' '}
                <Text style={{ fontWeight: '700', color: theme.colors.primary }}>
                  {(() => {
                    const d = new Date();
                    d.setDate(d.getDate() + reminderDays);
                    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  })()}
                </Text>
              </Text>
            )}
          </View>

          <Button
            title="Confirmar Anotação Agora"
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    paddingBottom: Platform.OS === 'android' ? 280 : 40,
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
    paddingVertical: 14,
    borderRadius: theme.borderRadius.sm,
  },
  dropdownSelectorText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textMain,
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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: '#f8fafc',
  },
  dropdownCreateText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.primary,
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
    backgroundColor: '#f0fdf4',
  },
  dropdownItemText: {
    fontSize: 15,
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
    height: 48,
    paddingHorizontal: 12,
    fontSize: 15,
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
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  suggestPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  quickTagsScroll: {
    marginTop: 8,
    flexDirection: 'row',
  },
  tagBtn: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    marginRight: 6,
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
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  amountText: {
    fontSize: 24,
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
    justifyContent: 'space-between',
    marginTop: 8,
  },
  shortcutBtn: {
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: theme.borderRadius.sm,
    width: '23%',
    alignItems: 'center',
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accent,
  },
});

