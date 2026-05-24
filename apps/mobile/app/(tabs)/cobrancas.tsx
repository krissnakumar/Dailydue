import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TouchableWithoutFeedback,
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
  const [customPopup, setCustomPopup] = useState<{
    visible: boolean;
    title: string;
    message: string;
    icon?: string;
    iconColor?: string;
    buttons: {
      text: string;
      onPress: () => void;
      variant?: 'primary' | 'secondary' | 'danger';
    }[];
  } | null>(null);

  const showAlert = (
    title: string,
    message: string,
    buttons?: { text: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger' }[],
    icon?: string,
    iconColor?: string
  ) => {
    setCustomPopup({
      visible: true,
      title,
      message,
      icon: icon || 'information-circle-outline',
      iconColor: iconColor || theme.colors.primaryBrand,
      buttons: buttons && buttons.length > 0 ? buttons.map(b => ({
        text: b.text,
        onPress: () => {
          setCustomPopup(null);
          if (b.onPress) b.onPress();
        },
        variant: b.variant
      })) : [{
        text: 'OK',
        onPress: () => setCustomPopup(null),
        variant: 'primary'
      }]
    });
  };

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

  const handleSendReminder = (customer: any, typeOverride?: 'simple' | 'detailed' | 'default') => {
    sendWhatsappReminder({
      customerName: customer.full_name,
      totalDebt: customer.total_debt,
      lastItems: customer.history.map((h: any) => ({ description: h.description, amount: h.amount })),
      phone: customer.phone,
      pixKey: businessConfig.pixKey,
      messageType: typeOverride || messageType,
      businessName: businessConfig.businessName,
    });
    setSelectedForNotice(null);
  };

  const handleSendBatch = () => {
    const selectedList = devedores.filter((c) => selectedIds.has(c.id));
    const comCelular = selectedList.filter((c) => c.phone && c.phone.length >= 10);
    if (comCelular.length === 0) {
      showAlert(
        'Aviso',
        'Nenhum dos clientes selecionados possui celular/WhatsApp válido cadastrado.',
        [{ text: 'Entendi', variant: 'primary' }],
        'alert-circle-outline',
        '#eab308'
      );
      return;
    }

    let currentIndex = 0;

    const sendNext = () => {
      if (currentIndex < comCelular.length) {
        const customer = comCelular[currentIndex];
        showAlert(
          'Enviar Cobrança',
          `Deseja enviar cobrança (${messageType === 'simple' ? 'Simplificada' : 'Detalhada'}) para ${customer.full_name}? (${currentIndex + 1} de ${comCelular.length})`,
          [
            { text: 'Parar', onPress: () => {}, variant: 'danger' },
            {
              text: 'Pular',
              onPress: () => {
                currentIndex++;
                setTimeout(sendNext, 300);
              },
              variant: 'secondary',
            },
            {
              text: 'Enviar',
              onPress: () => {
                handleSendReminder(customer);
                currentIndex++;
                setTimeout(sendNext, 1000);
              },
              variant: 'primary',
            },
          ],
          'logo-whatsapp',
          '#25D366'
        );
      } else {
        showAlert(
          'Sucesso',
          'Processo de cobrança em lote finalizado.',
          [{ text: 'Concluir', variant: 'primary' }],
          'checkmark-circle-outline',
          '#10b981'
        );
      }
    };

    showAlert(
      'Cobrança em Lote',
      `Iniciar envio sequencial (${messageType === 'simple' ? 'Simplificado' : 'Detalhado'}) para ${comCelular.length} cliente(s) selecionado(s)?`,
      [
        { text: 'Não', variant: 'secondary' },
        { text: 'Sim, Iniciar', onPress: sendNext, variant: 'primary' },
      ],
      'chatbubbles-outline',
      '#0284c7'
    );
  };

  return (
    <View style={styles.wrapper}>
      <Header showTotal={false} title="Painel de Cobranças" />

      <Animated.View
        entering={FadeInDown.duration(0)}
        style={styles.summaryWrapper}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Pendente</Text>
          <Text style={styles.summaryVal}>{formatCurrency(totalEmAberto)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Devedores</Text>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="chatbubbles-outline" size={16} color="#0369a1" />
          <Text style={styles.batchTitle}>Lote ({selectedIds.size})</Text>
        </View>

        <View style={styles.toggleGroup}>
          <TouchableOpacity
            style={[styles.toggleBtn, messageType === 'simple' && styles.toggleBtnActive]}
            onPress={() => setMessageType('simple')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, messageType === 'simple' && styles.toggleTextActive]}>
              Total
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, messageType === 'detailed' && styles.toggleBtnActive]}
            onPress={() => setMessageType('detailed')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, messageType === 'detailed' && styles.toggleTextActive]}>
              Detalhes
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.batchSendBtnCompact,
            (selectedIds.size === 0) && styles.batchSendBtnDisabled
          ]}
          onPress={handleSendBatch}
          disabled={selectedIds.size === 0}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-whatsapp" size={16} color="#ffffff" />
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
                      size={20}
                      color={selectedIds.has(c.id) ? theme.colors.primaryBrand : theme.colors.textMuted}
                    />
                  </TouchableOpacity>

                  {/* Body Content */}
                  <TouchableOpacity
                    style={styles.cardMainContent}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/clientes/${c.id}`)}
                  >
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName} numberOfLines={1}>
                        {c.full_name}
                      </Text>
                      <Text style={styles.debtValue}>
                        {formatCurrency(c.total_debt)}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Small WhatsApp Icon Button */}
                  {hasPhone && (
                    <TouchableOpacity
                      style={styles.smallWhatsappBtn}
                      activeOpacity={0.7}
                      onPress={() => handleSendReminder(c, 'default')}
                    >
                      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                    </TouchableOpacity>
                  )}
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

      {/* Custom Centered Alert/Confirm Dialog Popup */}
      {!!customPopup && (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.centeredOverlay}>
            <TouchableWithoutFeedback onPress={() => setCustomPopup(null)}>
              <View style={styles.centeredBackdrop} />
            </TouchableWithoutFeedback>

            <View style={styles.centeredPopupBox}>
              <Text style={styles.customPopupTitle}>{customPopup?.title}</Text>
              <Text style={styles.customPopupMessage}>{customPopup?.message}</Text>
              <View style={[
                styles.customPopupActions,
                customPopup?.buttons && customPopup.buttons.length > 2
                  ? { flexDirection: 'column', width: '100%', gap: 8 }
                  : { flexDirection: 'row', width: '100%', gap: 12 }
              ]}>
                {customPopup?.buttons.map((btn, idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.8}
                    style={[
                      styles.customPopupBtn,
                      customPopup.buttons.length <= 2 && { flex: 1 },
                      btn.variant === 'primary' && styles.customPopupBtnPrimary,
                      btn.variant === 'danger' && styles.customPopupBtnDanger,
                      btn.variant === 'secondary' && styles.customPopupBtnSecondary,
                    ]}
                    onPress={btn.onPress}
                  >
                    <Text
                      style={[
                        styles.customPopupBtnText,
                        btn.variant === 'secondary' ? styles.customPopupBtnTextSecondary : styles.customPopupBtnTextPrimary,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  summaryWrapper: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -8,
    gap: 12,
    maxWidth: 300,
    width: '100%',
    alignSelf: 'center',
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 2,
  },
  summaryVal: {
    fontSize: 16,
    fontWeight: '800',
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
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  batchTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#bae6fd',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
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
  batchSendBtnCompact: {
    backgroundColor: '#25D366',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  batchSendBtnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
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
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 4,
    ...theme.shadows.sm,
  },
  clientCardAtrasado: {
    borderColor: theme.colors.danger,
    backgroundColor: '#fffafb',
  },
  checkboxContainer: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMainContent: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 8,
  },
  clientInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clientName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMain,
    flex: 1,
  },
  debtValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
    marginRight: 4,
  },
  smallWhatsappBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
  centeredOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  centeredPopupBox: {
    width: '85%',
    maxWidth: 280,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    ...theme.shadows.lg,
  },
  customPopupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textMain,
    fontFamily: 'Outfit',
    marginBottom: 6,
    textAlign: 'center',
  },
  customPopupMessage: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  customPopupActions: {
    gap: 8,
  },
  customPopupBtn: {
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  customPopupBtnPrimary: {
    backgroundColor: theme.colors.primaryBrand,
  },
  customPopupBtnDanger: {
    backgroundColor: '#ef4444',
  },
  customPopupBtnSecondary: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  customPopupBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  customPopupBtnTextPrimary: {
    color: '#ffffff',
  },
  customPopupBtnTextSecondary: {
    color: '#475569',
  },
});
