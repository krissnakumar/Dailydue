import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
const OptimizedFlashList = FlashList as any;
import { useRouter, useNavigation } from 'expo-router';
import { Header, Button, CustomerRow, CustomerDetailContent } from '../../../src/components';
import { useDailyDueStore, isTempCustomerId } from '../../../src/store';
import { theme } from '../../../src/theme';
import { useResponsive } from '../../../src/utils/responsive';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCurrency } from '../../../src/utils';

const isEmoji = (str?: string) => {
  if (!str) return false;
  const s = String(str).trim();
  try {
    const emojiRegex = new RegExp('^(\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)+$', 'u');
    return emojiRegex.test(s);
  } catch {
    return s.length <= 4 && !s.includes('/') && !s.startsWith('data:');
  }
};

interface CustomerTableRowProps {
  item: any;
  isSelected: boolean;
  isPendingSync: boolean;
  onPress: () => void;
}

const CustomerTableRow = React.memo(({ item, isSelected, isPendingSync, onPress }: CustomerTableRowProps) => {
  const isZero = item.total_debt === 0;
  const isAtrasado = item.total_debt > 0 && item.history.some(
    (h: any) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > 15
  );

  return (
    <TouchableOpacity
      style={[
        styles.tableRow,
        isSelected && styles.tableRowSelected
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Column 1: Client info */}
      <View style={[styles.tdCell, { flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[styles.avatarMicro, { backgroundColor: isZero ? '#e6f4ea' : isAtrasado ? '#fce8e6' : '#fef7e0' }]}>
          {item.picture ? (
            isEmoji(item.picture) ? (
              <Text style={styles.avatarMicroEmoji}>{item.picture}</Text>
            ) : (
              <Image source={{ uri: item.picture }} style={styles.avatarMicroImage} />
            )
          ) : (
            <Ionicons
              name="person"
              size={12}
              color={isZero ? '#137333' : isAtrasado ? '#c5221f' : '#b06000'}
            />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.clientNameText} numberOfLines={1}>{item.full_name}</Text>
            <View style={[styles.statusDot, { backgroundColor: isZero ? '#22c55e' : isAtrasado ? '#ef4444' : '#f59e0b' }]} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            {isPendingSync ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8, backgroundColor: 'rgba(245,158,11,0.08)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                <Ionicons name="cloud-offline-outline" size={10} color="#b06000" style={{ marginRight: 2 }} />
                <Text style={{ fontSize: 9, color: '#b06000', fontWeight: 'bold' }}>Local</Text>
              </View>
            ) : null}
            {item.phone ? (
              <Text style={styles.clientPhoneText} numberOfLines={1}>{item.phone}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Column 2: Debt amount */}
      <View style={[styles.tdCell, { flex: 1, alignItems: 'flex-end' }]}>
        <Text style={[styles.debtTableValue, isZero && styles.debtTableZero]}>
          {formatCurrency(item.total_debt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default function ClientesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const layout = useResponsive();
  const insets = useSafeAreaInsets();
  const {
    customers,
    businessConfig,
    subscription,
    syncQueue,
  } = useDailyDueStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'devendo' | 'atrasados' | 'pagos'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);

  const filteredCustomers = customers.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = c.full_name.toLowerCase().includes(q);
      const matchPhone = c.phone?.includes(q);
      const matchDebt = c.total_debt.toString().includes(q);
      if (!matchName && !matchPhone && !matchDebt) return false;
    }

    if (activeFilter === 'devendo') return c.total_debt > 0;
    if (activeFilter === 'pagos') return c.total_debt === 0;
    if (activeFilter === 'atrasados') {
      if (c.total_debt <= 0) return false;
      return c.history.some(
        (h) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > 15
      );
    }

    return true;
  });

  const showSplitScreen = layout.isTablet || layout.isDesktop;
  const listColumns = showSplitScreen ? 1 : (layout.isTablet ? 2 : 1);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setSelectedCustomerId(undefined);
    });
    return unsubscribe;
  }, [navigation]);

  // Calcula Métricas de Resumo Geral
  const totalReceber = customers.reduce((sum, c) => sum + c.total_debt, 0);
  const clientesDevendo = customers.filter((c) => c.total_debt > 0).length;
  const clientesEmDia = customers.filter((c) => c.total_debt === 0).length;
  
  const clientesAtrasados = customers.filter((c) => {
    if (c.total_debt <= 0) return false;
    return c.history.some(
      (h) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > 15
    );
  }).length;

  // Atividades Recentes de todos os clientes
  const recentActivities = React.useMemo(() => {
    const list: Array<{
      id: string;
      description: string;
      amount: number;
      created_at: string;
      type: string;
      customerName: string;
      customerId: string;
      created_by?: string;
    }> = [];
    
    customers.forEach((c) => {
      c.history.forEach((h) => {
        list.push({
          ...h,
          customerName: c.full_name,
          customerId: c.id,
        });
      });
    });
    
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);
  }, [customers]);

  const handlePressRow = React.useCallback((itemId: string) => {
    if (showSplitScreen) {
      setSelectedCustomerId(itemId);
    } else {
      router.push(`/clientes/${itemId}`);
    }
  }, [showSplitScreen, router]);

  const renderItem = React.useCallback(({ item }: { item: any }) => {
    const isSelected = showSplitScreen && selectedCustomerId === item.id;
    const isTemp = isTempCustomerId(item.id);
    const isPendingSync = isTemp || syncQueue.some((q) => {
      const qCustId = q.payload?.customer_id || q.payload?.customerId || q.payload?.client_id || q.payload?.clientId;
      return String(qCustId) === String(item.id) || (q.type === 'update_customer' && String(q.payload?.id) === String(item.id));
    });

    return (
      <CustomerTableRow
        item={item}
        isSelected={isSelected}
        isPendingSync={isPendingSync}
        onPress={() => handlePressRow(item.id)}
      />
    );
  }, [showSplitScreen, selectedCustomerId, syncQueue, handlePressRow]);

  const keyExtractor = React.useCallback((item: any) => item.id, []);

  const renderGlobalSummary = () => {
    return (
      <ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>Resumo Geral dos Clientes</Text>
          <Text style={styles.summarySubtitle}>Visão consolidada e atividades recentes</Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { borderLeftColor: theme.colors.accent }]}>
            <Ionicons name="cash-outline" size={20} color={theme.colors.accent} style={{ marginBottom: 6 }} />
            <Text style={styles.metricLabel}>Total a Receber</Text>
            <Text style={[styles.metricValue, { color: theme.colors.accent }]}>{formatCurrency(totalReceber)}</Text>
          </View>

          <View style={[styles.metricCard, { borderLeftColor: '#eab308' }]}>
            <Ionicons name="people-outline" size={20} color="#eab308" style={{ marginBottom: 6 }} />
            <Text style={styles.metricLabel}>Clientes Devendo</Text>
            <Text style={styles.metricValue}>{clientesDevendo}</Text>
          </View>

          <View style={[styles.metricCard, { borderLeftColor: '#ef4444' }]}>
            <Ionicons name="alert-circle-outline" size={20} color="#ef4444" style={{ marginBottom: 6 }} />
            <Text style={styles.metricLabel}>{"Em Atraso (>15 dias)"}</Text>
            <Text style={[styles.metricValue, { color: '#ef4444' }]}>{clientesAtrasados}</Text>
          </View>

          <View style={[styles.metricCard, { borderLeftColor: '#22c55e' }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#22c55e" style={{ marginBottom: 6 }} />
            <Text style={styles.metricLabel}>Clientes em Dia</Text>
            <Text style={[styles.metricValue, { color: '#22c55e' }]}>{clientesEmDia}</Text>
          </View>
        </View>

        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Lançamentos Recentes (Todos os Clientes)</Text>
          {recentActivities.length === 0 ? (
            <Text style={styles.emptyRecentText}>Nenhuma atividade recente registrada.</Text>
          ) : (
            recentActivities.map((item, index) => {
              const isDebt = item.type === 'debt';
              const dtStr = new Date(item.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <View key={item.id || String(index)} style={styles.activityNode}>
                  <View style={[styles.activityDot, { backgroundColor: isDebt ? theme.colors.accent : theme.colors.primary }]} />
                  <View style={styles.activityBox}>
                    <View style={styles.activityHeaderRow}>
                      <Text style={styles.activityCustName} numberOfLines={1}>{item.customerName}</Text>
                      <Text style={[styles.activityAmount, { color: isDebt ? theme.colors.accent : theme.colors.primary }]}>
                        {isDebt ? '+' : '-'} {formatCurrency(item.amount)}
                      </Text>
                    </View>
                    <Text style={styles.activityDesc}>{item.description}</Text>
                    <Text style={styles.activityMeta}>{dtStr} • Por {item.created_by || 'Dono'}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={showSplitScreen ? styles.splitWrapper : styles.wrapper}>
      <View style={showSplitScreen ? styles.leftPane : { flex: 1 }}>
        <Header showTotal={false} title="Relação de Clientes" />

        <Animated.View style={styles.searchContainer}>
          <View style={styles.inputWrapper}>
            <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nome, celular ou R$..."
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>

        <Animated.View style={styles.filtersWrapper}>
          <View style={styles.filtersScroll}>
            {['all', 'devendo', 'atrasados', 'pagos'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterTab, activeFilter === f && styles.filterActive, { flexDirection: 'row', alignItems: 'center' }]}
                onPress={() => setActiveFilter(f as any)}
              >
                {f === 'devendo' && (
                  <Ionicons name="ellipse" size={8} color={activeFilter === f ? '#ffffff' : '#eab308'} style={{ marginRight: 4 }} />
                )}
                {f === 'atrasados' && (
                  <Ionicons name="ellipse" size={8} color={activeFilter === f ? '#ffffff' : '#ef4444'} style={{ marginRight: 4 }} />
                )}
                {f === 'pagos' && (
                  <Ionicons name="ellipse" size={8} color={activeFilter === f ? '#ffffff' : '#22c55e'} style={{ marginRight: 4 }} />
                )}
                <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                  {f === 'all' ? 'Todos' : f === 'devendo' ? 'Devendo' : f === 'atrasados' ? 'Atrasados' : 'Em Dia'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <Animated.View style={styles.listHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.listCount}>{filteredCustomers.length} clientes encontrados</Text>
            {showSplitScreen && selectedCustomerId && (
              <TouchableOpacity onPress={() => setSelectedCustomerId(undefined)} style={styles.clearSelectionBtn}>
                <Text style={styles.clearSelectionText}>• Ver Resumo</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => router.push('/clientes/novo')} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="add" size={14} color={theme.colors.primary} style={{ marginRight: 2 }} />
            <Text style={styles.quickAddText}>Cadastrar</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Table Header Row */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, { flex: 1 }]}>Cliente</Text>
          <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>Total</Text>
        </View>

        <OptimizedFlashList
          data={filteredCustomers}
          keyExtractor={keyExtractor}
          estimatedItemSize={60}
          contentContainerStyle={[
            styles.listContent,
            {
              maxWidth: layout.contentMaxWidth,
              alignSelf: 'center',
              width: '100%',
            },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color={theme.colors.textMuted} style={{ marginBottom: 12, opacity: 0.6 }} />
              <Text style={styles.emptyText}>Nenhum cliente atende ao critério de busca.</Text>
              <Button
                title="Cadastrar Novo Cliente"
                variant="ghost"
                onPress={() => router.push('/clientes/novo')}
                style={{ marginTop: 12 }}
              />
            </View>
          )}
        />

      </View>

      {showSplitScreen && (
        <View style={styles.rightPane}>
          {selectedCustomerId ? (
            <CustomerDetailContent
              id={selectedCustomerId}
              showBackButton={false}
              onDeleteSuccess={() => setSelectedCustomerId(undefined)}
            />
          ) : (
            renderGlobalSummary()
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  splitWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
  },
  summaryScroll: {
    padding: 24,
  },
  summaryHeader: {
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.textMain,
    fontFamily: 'Outfit',
  },
  summarySubtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  metricCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    ...theme.shadows.sm,
  },
  metricLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  recentSection: {
    marginTop: 8,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textMain,
    fontFamily: 'Outfit',
    marginBottom: 16,
  },
  emptyRecentText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  activityNode: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 12,
  },
  activityBox: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activityCustName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
    flex: 1,
    marginRight: 8,
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  activityDesc: {
    fontSize: 13,
    color: theme.colors.textMain,
    marginBottom: 4,
  },
  activityMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  leftPane: {
    width: 380,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  rightPane: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  emptyDetailContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  emptyDetailText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    height: 48,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.textMain,
    height: '100%',
  },
  clearBtn: {
    padding: 6,
  },
  clearText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  filtersWrapper: {
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  filtersScroll: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterTab: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    minHeight: 28,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  filterActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  filterText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  clearSelectionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clearSelectionText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.card,
  },
  thText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  tableRowSelected: {
    backgroundColor: 'rgba(34,197,94,0.05)',
  },
  tdCell: {
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
    alignSelf: 'center',
  },
  avatarMicro: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMicroImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  avatarMicroEmoji: {
    fontSize: 14,
  },
  clientNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  clientPhoneText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  statusTableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
  },
  statusTableBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  debtTableValue: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  debtTableZero: {
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  listCount: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  quickAddText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
  },
  listColumns: {
    gap: 12,
  },
  listItem: {
    width: '100%',
  },
  listItemGrid: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
    opacity: 0.6,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  modalContent: {
    paddingBottom: 8,
  },
  modalScroll: {
    maxHeight: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.textMain,
    fontFamily: 'Outfit',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 14,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formCol: {
    flex: 1,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMain,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    height: 46,
    paddingHorizontal: 16,
    fontSize: 15,
    color: theme.colors.textMain,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  radioButton: {
    flex: 1,
    height: 40,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  radioText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textMuted,
  },
  radioTextActive: {
    color: '#ffffff',
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  photoPreview: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreviewImg: {
    width: '100%',
    height: '100%',
  },
  photoPreviewText: {
    fontSize: 20,
    opacity: 0.7,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  photoBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.22)',
  },
  photoBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  photoBtnTextDanger: {
    color: '#b91c1c',
  },
});
