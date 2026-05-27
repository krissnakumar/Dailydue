import React, { useState, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components';
import { useDailyDueStore } from '../../src/store';
import { formatCurrency, sendWhatsappReceipt } from '../../src/utils';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAdaptiveColors, useResponsive } from '../../src/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PagamentosModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const layout = useResponsive();
  const colors = useAdaptiveColors();
  const insets = useSafeAreaInsets();
  const { customers, receivePayment, subscription, getCurrentMonthTransactionsCount } = useDailyDueStore();

  const [selectedCustId, setSelectedCustId] = useState<string>(params.customerId || '');
  const [payMethod, setPayMethod] = useState<'dinheiro' | 'PIX' | 'cartao'>('dinheiro');
  const [amountStr, setAmountStr] = useState('');
  const [sendReceipt, setSendReceipt] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Seleciona o primeiro cliente devedor se não vier preenchido
  useEffect(() => {
    if (!selectedCustId) {
      const devedores = customers.filter((c) => c.total_debt > 0);
      if (devedores.length > 0) {
        setSelectedCustId(devedores[0].id);
      } else if (customers.length > 0) {
        setSelectedCustId(customers[0].id);
      }
    }
  }, [customers]);

  const targetCust = customers.find((c) => c.id === selectedCustId);
  const currentDebt = targetCust ? targetCust.total_debt : 0;

  // Preenche valor total ou parcial
  const applyFullPayment = () => {
    if (currentDebt > 0) {
      setAmountStr(currentDebt.toFixed(2));
    }
  };

  const applyPartialPayment = (fraction: number) => {
    if (currentDebt > 0) {
      setAmountStr((currentDebt * fraction).toFixed(2));
    }
  };


  const handleConfirmPayment = async () => {
    const amt = parseFloat(amountStr);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Ops!', 'Qual foi o valor pago? 💰');
      return;
    }

    if (!selectedCustId || !targetCust) {
      Alert.alert('Ops!', 'Quem fez o pagamento? Selecione um cliente. 👤');
      return;
    }

    if (amt > currentDebt) {
      Alert.alert(
        'Valor Excedido ⚠️',
        `O pagamento (R$ ${amt.toFixed(2)}) não pode ser maior que a dívida atual (R$ ${currentDebt.toFixed(2)}).`
      );
      return;
    }

    // Check transaction limit before registering payment
    if (
      !subscription.is_premium &&
      subscription.max_transactions_per_month !== null &&
      getCurrentMonthTransactionsCount() >= subscription.max_transactions_per_month
    ) {
      Alert.alert(
        'Limite do Plano Grátis 🔒',
        'Limite de lançamentos do mês atingido. Faça o upgrade para o Premium!',
        [
          { text: 'Depois', style: 'cancel' },
          { text: 'Ver Planos', onPress: () => router.push('/subscription') }
        ]
      );
      return;
    }

    try {
      // Registra baixa na caderneta
      receivePayment(selectedCustId, amt, payMethod);

      // Envia comprovante por WhatsApp se marcado
      if (sendReceipt && targetCust.phone) {
        await sendWhatsappReceipt(
          targetCust.full_name,
          amt,
          payMethod.toUpperCase(),
          Math.max(0, currentDebt - amt),
          targetCust.phone
        );
      } else {
        Alert.alert(
          'Pronto! 🎉',
          `Abatemos R$ ${amt.toFixed(2)} da conta de ${targetCust.full_name.split(' ')[0]}!`
        );
      }

      router.back();
    } catch (err: any) {
      if (err.message === 'FREE_PLAN_TRANSACTION_LIMIT_REACHED') {
        Alert.alert(
          'Limite do Plano Grátis 🔒',
          'Limite de lançamentos atingido. Faça o upgrade para o Premium!',
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Ver Planos', onPress: () => router.push('/subscription') }
          ]
        );
      } else if (err.message === 'PAYMENT_EXCEEDS_DEBT') {
        Alert.alert(
          'Valor Excedido ⚠️',
          `O valor do pagamento não pode ser maior que a dívida atual.`
        );
      } else {
        Alert.alert('Eita!', 'Não conseguimos salvar agora. Tente de novo! 😅');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.headerInner, { maxWidth: layout.formMaxWidth + layout.spacing.screen * 2 }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Receber Pagamento</Text>
          <Text style={styles.headerBadge}>Abater Dívida</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.colors.textMuted} />
        </TouchableOpacity>
        </View>
      </View>

      <ScrollView
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
      >
        {/* 1. Selecionar Cliente */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>1. Selecione o Cliente *</Text>
          <TouchableOpacity
            style={[styles.dropdownSelector, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]}
            onPress={() => setShowCustomerDropdown(!showCustomerDropdown)}
            activeOpacity={0.8}
          >
            <Text style={[styles.dropdownSelectorText, { color: colors.text }]} numberOfLines={1}>
              {selectedCustId 
                ? (() => {
                    const c = customers.find((cust) => cust.id === selectedCustId);
                    return c ? `${c.full_name} (${formatCurrency(c.total_debt)})` : 'Selecione um…';
                  })()
                : 'Selecione um…'}
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
                  router.push('/clientes/novo?next=pagamentos');
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.dropdownCreateText}>Cadastrar Novo Cliente</Text>
              </TouchableOpacity>

              {customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.dropdownItem, { borderBottomColor: colors.border }, selectedCustId === c.id && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedCustId(c.id);
                    setAmountStr('');
                    setShowCustomerDropdown(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, { color: colors.text }, selectedCustId === c.id && styles.dropdownItemTextActive]} numberOfLines={1}>
                    {c.full_name} • {formatCurrency(c.total_debt)}
                  </Text>
                  {selectedCustId === c.id && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* 2. Forma de Pagamento */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>2. Método de Pagamento</Text>
          <View style={styles.methodsRow}>
            <TouchableOpacity
              style={[styles.methodBtn, payMethod === 'dinheiro' && styles.methodBtnActive, { flexDirection: 'row' }]}
              onPress={() => setPayMethod('dinheiro')}
            >
              <Ionicons
                name="cash-outline"
                size={14}
                color={payMethod === 'dinheiro' ? theme.colors.primaryDark : theme.colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.methodText, payMethod === 'dinheiro' && styles.methodTextActive]}>
                Dinheiro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.methodBtn, payMethod === 'PIX' && styles.methodBtnActive, { flexDirection: 'row' }]}
              onPress={() => setPayMethod('PIX')}
            >
              <Ionicons
                name="flash-outline"
                size={14}
                color={payMethod === 'PIX' ? theme.colors.primaryDark : theme.colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.methodText, payMethod === 'PIX' && styles.methodTextActive]}>
                PIX
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.methodBtn, payMethod === 'cartao' && styles.methodBtnActive, { flexDirection: 'row' }]}
              onPress={() => setPayMethod('cartao')}
            >
              <Ionicons
                name="card-outline"
                size={14}
                color={payMethod === 'cartao' ? theme.colors.primaryDark : theme.colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.methodText, payMethod === 'cartao' && styles.methodTextActive]}>
                Cartão
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Valor Recebido com Display Gigante */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>3. Valor Recebido (R$) *</Text>
          <TextInput
            style={[styles.amountDisplay, styles.amountText, { textAlign: 'center', backgroundColor: colors.mutedSurface, borderColor: colors.border }]}
            value={amountStr}
            onChangeText={(text) => {
               const cleaned = text.replace(/[^0-9.,]/g, '').replace(',', '.');
               setAmountStr(cleaned);
            }}
            keyboardType="decimal-pad"
            placeholder="R$ 0.00"
            placeholderTextColor={theme.colors.textMuted}
          />

          {/* Opções de Preenchimento Automático */}
          <View style={styles.shortcutsRow}>
            <TouchableOpacity style={styles.shortcutBtn} onPress={applyFullPayment}>
              <Text style={styles.shortcutText}>Valor Total</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcutBtn} onPress={() => applyPartialPayment(0.5)}>
              <Text style={styles.shortcutText}>Metade (50%)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Opção Enviar Comprovante */}
        {targetCust?.phone ? (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setSendReceipt(!sendReceipt)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, sendReceipt && styles.checkboxActive]}>
              {sendReceipt && (
                <Ionicons name="checkmark" size={14} color="#ffffff" />
              )}
            </View>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>Enviar recibo digital no WhatsApp do cliente</Text>
          </TouchableOpacity>
        ) : null}

        <Button
          title="Confirmar Baixa na Caderneta"
          variant="success"
          size="lg"
          leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.primaryDark} style={{ marginRight: 6 }} />}
          onPress={handleConfirmPayment}
          style={{ marginTop: 12 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  headerInner: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  headerBadge: {
    backgroundColor: '#d1fae5',
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  scrollContent: {
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
  custScroll: {
    flexDirection: 'row',
    marginBottom: 4,
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

  methodsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  methodBtn: {
    flex: 1,
    minHeight: 36,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  methodBtnActive: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.success,
  },
  methodText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  methodTextActive: {
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
  amountDisplay: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    fontFamily: 'Outfit',
  },
  shortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  shortcutBtn: {
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.sm,
    flexGrow: 1,
    flexBasis: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: theme.colors.whatsapp,
    borderColor: theme.colors.whatsapp,
  },
  checkboxTick: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 13,
    color: theme.colors.textMain,
    flex: 1,
  },
});
