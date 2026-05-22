import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button, AnimatedPopup } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { formatCurrency, sendWhatsappReminder } from '../../src/utils';
import { theme } from '../../src/theme';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function CobrancasScreen() {
  const router = useRouter();
  const { customers, businessConfig } = useFiadoStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'acima50' | 'atrasados'>('all');
  const [selectedForNotice, setSelectedForNotice] = useState<any>(null);

  const totalEmAberto = customers.reduce((acc, curr) => acc + curr.total_debt, 0);
  const totalDevedores = customers.filter((c) => c.total_debt > 0).length;

  const devedores = customers.filter((c) => {
    if (c.total_debt <= 0) return false;
    if (activeFilter === 'acima50') return c.total_debt >= 50;
    if (activeFilter === 'atrasados') {
      return c.history.some(
        (h) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > 15
      );
    }
    return true;
  });

  const handleSendReminder = (customer: any) => {
    sendWhatsappReminder({
      customerName: customer.full_name,
      totalDebt: customer.total_debt,
      lastItems: customer.history.map((h: any) => ({ description: h.description, amount: h.amount })),
      phone: customer.phone,
      pixKey: businessConfig.pixKey,
    });
    setSelectedForNotice(null);
  };

  const handleSendBatch = () => {
    const comCelular = devedores.filter((c) => c.phone && c.phone.length >= 10);
    if (comCelular.length === 0) {
      Alert.alert('Aviso', 'Nenhum cliente listado possui celular/WhatsApp válido cadastrado.');
      return;
    }

    let currentIndex = 0;

    const sendNext = () => {
      if (currentIndex < comCelular.length) {
        const customer = comCelular[currentIndex];
        Alert.alert(
          'Próximo Envio',
          `Enviar cobrança para ${customer.full_name}? (${currentIndex + 1}/${comCelular.length})`,
          [
            { text: 'Parar', style: 'cancel' },
            {
              text: 'Enviar',
              onPress: () => {
                handleSendReminder(customer);
                currentIndex++;
                setTimeout(sendNext, 1000);
              },
            },
            {
              text: 'Pular',
              onPress: () => {
                currentIndex++;
                sendNext();
              },
            },
          ]
        );
      } else {
        Alert.alert('Sucesso', 'Processo de cobrança em lote finalizado.');
      }
    };

    Alert.alert(
      'Cobrança em Lote',
      `Iniciar envio sequencial para ${comCelular.length} cliente(s)?`,
      [
        { text: 'Não', style: 'cancel' },
        { text: 'Sim, Iniciar', onPress: sendNext },
      ]
    );
  };

  return (
    <View style={styles.wrapper}>
      <Header showTotal={false} title="Painel de Cobranças" />

      <Animated.View
        entering={FadeInDown.duration(0)}
        style={styles.summaryContainer}
      >
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Pendente</Text>
          <Text style={styles.summaryVal}>{formatCurrency(totalEmAberto)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Clientes Devedores</Text>
          <Text style={styles.summaryVal}>{totalDevedores}</Text>
        </View>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(0).duration(0)}
        style={styles.tabsRow}
      >
        {[
          { id: 'all', label: 'Todos', icon: 'people-outline' as const },
          { id: 'acima50', label: '> R$ 50', icon: 'cash-outline' as const },
          { id: 'atrasados', label: 'Atrasados', icon: 'alert-circle-outline' as const },
        ].map((tab) => {
          const isActive = activeFilter === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, isActive && styles.tabBtnActive, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => setActiveFilter(tab.id as any)}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={isActive ? '#ffffff' : theme.colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(0).duration(0)}
        style={styles.batchBox}
      >
        <View style={styles.batchIconBox}>
          <Ionicons name="chatbubbles-outline" size={20} color="#0369a1" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.batchTitle}>Lembretes em Massa</Text>
          <Text style={styles.batchDesc}>
            Selecione um filtro e envie mensagens personalizadas com sua chave PIX.
          </Text>
        </View>
        <TouchableOpacity style={styles.batchActionBtn} onPress={handleSendBatch}>
          <Text style={styles.batchActionText}>Iniciar</Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.listTitle}>Lista de Contatos ({devedores.length})</Text>

        {devedores.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={40} color="#10b981" style={{ marginBottom: 10 }} />
            <Text style={styles.emptyText}>Tudo em ordem por aqui!</Text>
          </View>
        ) : (
          devedores.map((c, idx) => {
            const hasPhone = c.phone && c.phone.length >= 10;
            const isAtrasado = c.history.some(
              (h) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > 15
            );

            return (
              <Animated.View
                key={c.id}
                entering={FadeInDown.delay(0).duration(0)}
              >
                <TouchableOpacity
                  style={[styles.clientCard, isAtrasado && styles.clientCardAtrasado]}
                  activeOpacity={0.7}
                  onPress={() => setSelectedForNotice(c)}
                >
                  <View style={styles.clientInfo}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{c.full_name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clientName}>{c.full_name}</Text>
                      <Text style={styles.phoneText}>
                        {hasPhone ? `WhatsApp: +55 ${c.phone}` : 'Sem WhatsApp'}
                      </Text>
                    </View>
                    <View style={styles.debtBox}>
                      <Text style={styles.debtLabel}>Deve</Text>
                      <Text style={styles.debtValue}>{formatCurrency(c.total_debt)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Popup de Confirmação de Envio */}
      <AnimatedPopup visible={!!selectedForNotice} onClose={() => setSelectedForNotice(null)}>
        {selectedForNotice && (
          <View style={styles.popupContent}>
            <Text style={styles.popupTitle}>Enviar Cobrança</Text>
            <Text style={styles.popupSub}>
              Deseja enviar o lembrete de pagamento para <Text style={{ fontWeight: 'bold' }}>{selectedForNotice.full_name}</Text>?
            </Text>

            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Conteúdo da Mensagem:</Text>
              <Text style={styles.previewText}>
                Olá {selectedForNotice.full_name}, passando para lembrar da sua conta no Caderninho...
                Valor total: {formatCurrency(selectedForNotice.total_debt)}
              </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Button
                title="Ver Perfil"
                variant="secondary"
                leftIcon={<Ionicons name="person-outline" size={16} color={theme.colors.textMain} style={{ marginRight: 6 }} />}
                onPress={() => {
                  const id = selectedForNotice.id;
                  setSelectedForNotice(null);
                  router.push(`/clientes/${id}`);
                }}
              />
            </View>

            <View style={styles.popupActions}>
              <Button
                title="Cancelar"
                variant="ghost"
                onPress={() => setSelectedForNotice(null)}
                style={{ flex: 1 }}
              />
              <Button
                title="Enviar Agora"
                variant="primary"
                onPress={() => handleSendReminder(selectedForNotice)}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        )}
      </AnimatedPopup>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  summaryContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: -20,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    ...theme.shadows.md,
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryVal: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textMain,
    fontFamily: 'Outfit',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 20,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabBtnActive: {
    backgroundColor: theme.colors.primaryBrand,
    borderColor: theme.colors.primaryBrand,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  batchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  batchIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  batchIcon: {
    fontSize: 20,
  },
  batchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
  },
  batchDesc: {
    fontSize: 11,
    color: '#075985',
    lineHeight: 14,
  },
  batchActionBtn: {
    backgroundColor: '#0369a1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  batchActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  clientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  clientCardAtrasado: {
    borderColor: theme.colors.danger,
    backgroundColor: '#fffafb',
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  phoneText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  debtBox: {
    alignItems: 'flex-end',
  },
  debtLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  debtValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  popupContent: {
    paddingBottom: 10,
  },
  popupTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginBottom: 4,
  },
  popupSub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 20,
  },
  previewBox: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  previewText: {
    fontSize: 13,
    color: theme.colors.textMain,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  popupActions: {
    flexDirection: 'row',
    gap: 12,
  },
});
