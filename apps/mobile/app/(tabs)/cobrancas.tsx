import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Card, Button, AnimatedPopup } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { formatCurrency, sendWhatsappReminder } from '../../src/utils';
import { theme } from '../../src/theme';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export default function CobrancasScreen() {
  const router = useRouter();
  const { customers, businessConfig } = useFiadoStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'acima50' | 'atrasados'>('all');
  const [selectedForNotice, setSelectedForNotice] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messageType, setMessageType] = useState<'simple' | 'detailed'>('detailed');

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

  // Automatically select clients with valid phone numbers when filter or list updates
  useEffect(() => {
    const validPhones = devedores
      .filter((c) => c.phone && c.phone.length >= 10)
      .map((c) => c.id);
    setSelectedIds(new Set(validPhones));
  }, [activeFilter, customers]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = devedores.every((d) => selectedIds.has(d.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(devedores.map((d) => d.id)));
    }
  };

  const handleSendReminder = (customer: any) => {
    sendWhatsappReminder({
      customerName: customer.full_name,
      totalDebt: customer.total_debt,
      lastItems: customer.history.map((h: any) => ({ description: h.description, amount: h.amount })),
      phone: customer.phone,
      pixKey: businessConfig.pixKey,
      messageType,
    });
    setSelectedForNotice(null);
  };

  const handleSendBatch = () => {
    const selectedList = devedores.filter((c) => selectedIds.has(c.id));
    const comCelular = selectedList.filter((c) => c.phone && c.phone.length >= 10);
    if (comCelular.length === 0) {
      Alert.alert('Aviso', 'Nenhum dos clientes selecionados possui celular/WhatsApp válido cadastrado.');
      return;
    }

    let currentIndex = 0;

    const sendNext = () => {
      if (currentIndex < comCelular.length) {
        const customer = comCelular[currentIndex];
        Alert.alert(
          'Próximo Envio',
          `Enviar cobrança (${messageType === 'simple' ? 'Simplificada' : 'Detalhada'}) para ${customer.full_name}? (${currentIndex + 1}/${comCelular.length})`,
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
      `Iniciar envio sequencial (${messageType === 'simple' ? 'Simplificado' : 'Detalhado'}) para ${comCelular.length} cliente(s) selecionado(s)?`,
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
        <View style={styles.batchHeader}>
          <View style={styles.batchIconBox}>
            <Ionicons name="chatbubbles-outline" size={20} color="#0369a1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.batchTitle}>Lembretes em Massa</Text>
            <Text style={styles.batchDesc}>
              Selecione os clientes abaixo para enviar cobranças no WhatsApp.
            </Text>
          </View>
        </View>

        <View style={styles.batchDivider} />

        <View style={styles.batchConfigRow}>
          <View style={styles.batchCountBox}>
            <Text style={styles.batchConfigLabel}>Selecionados</Text>
            <Text style={styles.batchCountText}>
              {selectedIds.size} de {devedores.length}
            </Text>
          </View>

          <View style={styles.batchModelBox}>
            <Text style={styles.batchConfigLabel}>Modelo de Lembrete</Text>
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                style={[styles.toggleBtn, messageType === 'simple' && styles.toggleBtnActive]}
                onPress={() => setMessageType('simple')}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleText, messageType === 'simple' && styles.toggleTextActive]}>
                  Só o Total
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, messageType === 'detailed' && styles.toggleBtnActive]}
                onPress={() => setMessageType('detailed')}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleText, messageType === 'detailed' && styles.toggleTextActive]}>
                  Detalhado
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.batchSendBtn,
            (selectedIds.size === 0) && styles.batchSendBtnDisabled
          ]}
          onPress={handleSendBatch}
          disabled={selectedIds.size === 0}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#ffffff" style={{ marginRight: 8 }} />
          <Text style={styles.batchSendText}>
            Enviar no WhatsApp ({selectedIds.size})
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <View style={styles.listHeaderRow}>
          <Text style={styles.listTitle}>Lista de Contatos ({devedores.length})</Text>
          {devedores.length > 0 && (
            <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.7} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>
                {devedores.every((d) => selectedIds.has(d.id)) ? "Desmarcar Todos" : "Selecionar Todos"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

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
                <View style={[styles.clientCard, isAtrasado && styles.clientCardAtrasado]}>
                  {/* Checkbox */}
                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => toggleSelect(c.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={selectedIds.has(c.id) ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={selectedIds.has(c.id) ? theme.colors.primaryBrand : theme.colors.textMuted}
                    />
                  </TouchableOpacity>

                  {/* Body Content */}
                  <TouchableOpacity
                    style={styles.cardMainContent}
                    activeOpacity={0.7}
                    onPress={() => setSelectedForNotice(c)}
                  >
                    <View style={styles.clientInfo}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{c.full_name[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.clientName} numberOfLines={1}>{c.full_name}</Text>
                        <Text style={styles.phoneText} numberOfLines={1}>
                          {hasPhone ? `WhatsApp: +55 ${c.phone}` : 'Sem WhatsApp'}
                        </Text>
                      </View>
                      <View style={styles.debtBox}>
                        <Text style={styles.debtLabel}>Deve</Text>
                        <Text style={styles.debtValue}>{formatCurrency(c.total_debt)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Direct Send Icon */}
                  <TouchableOpacity
                    style={[styles.quickSendBtn, !hasPhone && styles.quickSendBtnDisabled]}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (hasPhone) {
                        handleSendReminder(c);
                      } else {
                        setSelectedForNotice(c);
                      }
                    }}
                  >
                    <Ionicons
                      name={hasPhone ? "logo-whatsapp" : "share-social-outline"}
                      size={20}
                      color={hasPhone ? "#25D366" : theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
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

            {/* Custom Model Toggle inside Popup */}
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.popupSectionLabel}>Modelo de Mensagem</Text>
              <View style={[styles.toggleGroup, { alignSelf: 'flex-start', marginTop: 8 }]}>
                <TouchableOpacity
                  style={[styles.toggleBtn, messageType === 'simple' && styles.toggleBtnActive]}
                  onPress={() => setMessageType('simple')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.toggleText, messageType === 'simple' && styles.toggleTextActive]}>
                    Só o Total
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, messageType === 'detailed' && styles.toggleBtnActive]}
                  onPress={() => setMessageType('detailed')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.toggleText, messageType === 'detailed' && styles.toggleTextActive]}>
                    Detalhado
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Conteúdo da Mensagem:</Text>
              <Text style={styles.previewText}>
                {messageType === 'simple'
                  ? `Olá ${selectedForNotice.full_name.split(' ')[0]}! Tudo bem? Passando para enviar o lembrete de pagamento do seu saldo no Caderninho. Valor pendente: ${formatCurrency(selectedForNotice.total_debt)}`
                  : `Olá ${selectedForNotice.full_name.split(' ')[0]}! Tudo bem? Passando para enviar o resumo da sua continha no nosso Caderninho de Fiado. Total devendo: ${formatCurrency(selectedForNotice.total_debt)}`}
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
                title={selectedForNotice.phone ? "Enviar WhatsApp" : "Compartilhar"}
                variant="primary"
                leftIcon={
                  selectedForNotice.phone ? (
                    <Ionicons name="logo-whatsapp" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  ) : (
                    <Ionicons name="share-social-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  )
                }
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
    backgroundColor: '#e0f2fe',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  batchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batchIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  batchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
  },
  batchDesc: {
    fontSize: 11,
    color: '#075985',
    lineHeight: 14,
    marginTop: 2,
  },
  batchDivider: {
    height: 1,
    backgroundColor: '#bae6fd',
    marginVertical: 12,
  },
  batchConfigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  batchCountBox: {
    flex: 1,
  },
  batchModelBox: {
    flex: 1.5,
    alignItems: 'flex-end',
  },
  batchConfigLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369a1',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  batchCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#075985',
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#bae6fd',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    elevation: 1,
  },
  toggleText: {
    fontSize: 10,
    color: '#0369a1',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: theme.colors.primaryBrand,
    fontWeight: '700',
  },
  batchSendBtn: {
    flexDirection: 'row',
    backgroundColor: '#25D366',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  batchSendBtnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  batchSendText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  selectAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primaryBrand,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  clientCardAtrasado: {
    borderColor: theme.colors.danger,
    backgroundColor: '#fffafb',
  },
  checkboxContainer: {
    paddingLeft: 12,
    paddingRight: 6,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMainContent: {
    flex: 1,
    paddingVertical: 12,
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  phoneText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  debtBox: {
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  debtLabel: {
    fontSize: 9,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  debtValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
  },
  quickSendBtn: {
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#f1f5f9',
  },
  quickSendBtnDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
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
  popupSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
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
