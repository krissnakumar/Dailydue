import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AnimatedPopup } from './AnimatedPopup';
import { Button } from './Button';
import { useFiadoStore } from '../store';
import { theme } from '../theme';
import { Ionicons } from '@expo/vector-icons';

export function NovoFiadoPopup() {
  const router = useRouter();
  const { customers, getSmartSuggestions, addDebt, subscription, getCurrentMonthTransactionsCount, novoFiadoState, closeNovoFiado, openNovoCliente } = useFiadoStore();

  const [selectedCustId, setSelectedCustId] = useState<string>('');
  const [descInput, setDescInput] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [reminderDays, setReminderDays] = useState<number | null>(null);

  useEffect(() => {
    if (novoFiadoState.isOpen) {
      setSelectedCustId(novoFiadoState.customerId || (customers.length > 0 ? customers[0].id : ''));
      setDescInput('');
      setAmountStr('');
      setShowSuggestions(false);
      setShowCustomerDropdown(false);
      setReminderDays(null);
    }
  }, [novoFiadoState.isOpen, novoFiadoState.customerId, customers]);

  const suggestions = getSmartSuggestions(descInput);

  const handleChipSelect = (name: string, price: number) => {
    setDescInput(name);
    if (price > 0) {
      setAmountStr(price.toFixed(2));
    }
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
          { text: 'Ver Planos', onPress: () => { closeNovoFiado(); router.push('/subscription'); } }
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
      closeNovoFiado();
    } catch (err: any) {
      if (err.message === 'FREE_PLAN_TRANSACTION_LIMIT_REACHED') {
        Alert.alert(
          'Plano Básico 🔒',
          'Limite de lançamentos atingido. Mude para o Premium!',
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Ver Planos', onPress: () => { closeNovoFiado(); router.push('/subscription'); } }
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert('Eita!', 'Não conseguimos salvar agora. Tente de novo! 😅', [{ text: 'OK' }], { cancelable: true });
      }
    }
  };

  return (
    <AnimatedPopup visible={novoFiadoState.isOpen} onClose={closeNovoFiado}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
                 {selectedCustId ? customers.find(c => c.id === selectedCustId)?.full_name || 'Selecione um cliente...' : 'Selecione um cliente...'}
              </Text>
              <Ionicons name={showCustomerDropdown ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>

            {showCustomerDropdown && (
              <View style={styles.dropdownList}>
                <TouchableOpacity 
                  style={styles.dropdownCreateBtn} 
                  onPress={() => {
                     setShowCustomerDropdown(false);
                     closeNovoFiado();
                     openNovoCliente();
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

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickTagsScroll}>
              {suggestions.slice(0, 5).map((s, i) => (
                <TouchableOpacity
                  key={'tag' + i}
                  style={styles.tagBtn}
                  onPress={() => handleChipSelect(s.name, s.price)}
                >
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
                   if (!isNaN(num)) {
                     setReminderDays(num);
                   } else {
                     setReminderDays(null);
                   }
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
    </AnimatedPopup>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.inputBg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
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
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 18,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    padding: 16,
    paddingBottom: 40,
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
  reminderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
  },
  reminderChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  reminderText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  reminderTextActive: {
    color: '#ffffff',
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
