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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { Button } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function NovoFiadoModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { customers, getSmartSuggestions, addDebt, subscription, getCurrentMonthTransactionsCount } = useFiadoStore();

  const [selectedCustId, setSelectedCustId] = useState<string>(params.customerId || '');
  const [descInput, setDescInput] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Animations
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(50);

  useEffect(() => {
    contentOpacity.value = withDelay(100, withTiming(1, { duration: 600 }));
    contentTranslateY.value = withDelay(100, withSpring(0, { damping: 15 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // Seleciona o primeiro cliente se não vier preenchido
  useEffect(() => {
    if (!selectedCustId && customers.length > 0) {
      setSelectedCustId(customers[0].id);
    }
  }, [customers]);

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
      Alert.alert('Aviso', 'Informe um valor da compra maior que zero.');
      return;
    }

    if (!selectedCustId) {
      Alert.alert('Aviso', 'Selecione o cliente para lançar o fiado.');
      return;
    }

    // Check transaction limit before adding
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

    const targetCust = customers.find((c) => c.id === selectedCustId);

    try {
      addDebt(selectedCustId, amt, descInput.trim() || 'Fiado / Balcão');

      Alert.alert(
        'Sucesso',
        `✔️ Anotação de R$ ${amt.toFixed(2)} lançada para ${targetCust?.full_name.split(' ')[0]}!`
      );
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
        Alert.alert('Erro', 'Não foi possível realizar o lançamento.');
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
          <Text style={styles.headerTitle}>Lançamento Rápido</Text>
          <Text style={styles.headerBadge}>Balcão em 5s</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Animated.View style={[{ flex: 1 }, animatedStyle]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>1. Selecione o Cliente *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.custScroll}>
              {customers.map((c) => {
                const isSelected = c.id === selectedCustId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.custChip, isSelected && styles.custChipActive]}
                    onPress={() => setSelectedCustId(c.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.custChipText, isSelected && styles.custChipTextActive]}>
                      {c.full_name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>2. O que levou? (Auto-Sugestão Inteligente)</Text>
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

            <View style={styles.shortcutsRow}>
              {[10, 20, 50, 100].map((val) => (
                <TouchableOpacity key={val} style={styles.shortcutBtn} onPress={() => addQuickShortcut(val)}>
                  <Text style={styles.shortcutText}>+ R$ {val}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
      </Animated.View>
    </KeyboardAvoidingView>
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
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
  },
  shortcutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  shortcutBtn: {
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    width: '23%',
    alignItems: 'center',
  },
  shortcutText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.accent,
  },
});
