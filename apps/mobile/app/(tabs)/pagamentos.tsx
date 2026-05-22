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
import { useFiadoStore } from '../../src/store';
import { formatCurrency, sendWhatsappReceipt } from '../../src/utils';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PagamentosModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { customers, receivePayment, subscription, getCurrentMonthTransactionsCount } = useFiadoStore();

  const [selectedCustId, setSelectedCustId] = useState<string>(params.customerId || '');
  const [payMethod, setPayMethod] = useState<'dinheiro' | 'PIX' | 'cartao'>('dinheiro');
  const [amountStr, setAmountStr] = useState('');
  const [sendReceipt, setSendReceipt] = useState(false);

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
      Alert.alert('Aviso', 'Informe o valor exato recebido para abater na conta.');
      return;
    }

    if (!selectedCustId || !targetCust) {
      Alert.alert('Aviso', 'Selecione o cliente que está realizando o pagamento.');
      return;
    }

    // Check transaction limit before registering payment
    if (
      !subscription.is_premium &&
      subscription.max_transactions_per_month !== null &&
      getCurrentMonthTransactionsCount() >= subscription.max_transactions_per_month
    ) {
      Alert.alert(
        'Limite de Lançamentos Atingido',
        'Você atingiu o limite de 30 lançamentos no plano gratuito. Faça o upgrade para o Premium para lançamentos ilimitados.',
        [
          { text: 'Voltar', style: 'cancel' },
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
          'Sucesso',
          `✔️ Baixa de ${formatCurrency(amt)} registrada para ${targetCust.full_name.split(' ')[0]}!`
        );
      }

      router.back();
    } catch (err: any) {
      if (err.message === 'FREE_PLAN_TRANSACTION_LIMIT_REACHED') {
        Alert.alert(
          'Limite de Lançamentos Atingido',
          'Você atingiu o limite de 30 lançamentos no plano gratuito. Faça o upgrade para o Premium para lançamentos ilimitados.',
          [
            { text: 'Voltar', style: 'cancel' },
            { text: 'Ver Planos', onPress: () => router.push('/subscription') }
          ]
        );
      } else {
        Alert.alert('Erro', 'Não foi possível registrar o pagamento.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Receber Pagamento</Text>
          <Text style={styles.headerBadge}>Abater Dívida</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Selecionar Cliente */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>1. Selecione o Cliente *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.custScroll}>
            {customers.map((c) => {
              const isSelected = c.id === selectedCustId;
              const hasDebt = c.total_debt > 0;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.custChip,
                    isSelected && styles.custChipActive,
                    !hasDebt && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    setSelectedCustId(c.id);
                    setAmountStr('');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.custChipText, isSelected && styles.custChipTextActive]}>
                    {c.full_name.split(' ')[0]} • {formatCurrency(c.total_debt)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 2. Informação do Débito Atual */}
        <View style={styles.debtPreviewBox}>
          <Text style={styles.debtPreviewLabel}>Saldo Pendente do Cliente:</Text>
          <Text style={styles.debtPreviewVal}>{formatCurrency(currentDebt)}</Text>
        </View>

        {/* 3. Forma de Pagamento */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>2. Método de Pagamento</Text>
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
          <Text style={styles.label}>3. Valor Recebido (R$) *</Text>
          <TextInput
            style={[styles.amountDisplay, styles.amountText, { textAlign: 'center' }]}
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
            <Text style={styles.checkboxLabel}>Enviar recibo digital no WhatsApp do cliente</Text>
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
    backgroundColor: theme.colors.card,
    marginTop: Platform.OS === 'ios' ? 40 : 0,
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
    backgroundColor: '#d1fae5',
    color: theme.colors.primaryDark,
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
  custChip: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
    marginRight: 8,
  },
  custChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  custChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  custChipTextActive: {
    color: '#ffffff',
  },
  debtPreviewBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  debtPreviewLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  debtPreviewVal: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
  },
  methodsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  methodBtn: {
    flex: 1,
    height: 44,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  methodBtnActive: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.success,
  },
  methodText: {
    fontSize: 13,
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
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    fontFamily: 'Outfit',
  },
  shortcutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  shortcutBtn: {
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.sm,
    width: '45%',
    alignItems: 'center',
  },
  shortcutText: {
    fontSize: 13,
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
