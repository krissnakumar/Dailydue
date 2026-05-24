import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { AdaptiveCard, AdaptiveContainer, AdaptiveGrid, Header, Card } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { formatCurrency } from '../../src/utils';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();
  const { customers } = useFiadoStore();
  const [searchQuery, setSearchQuery] = React.useState('');

  // Calcula Métricas de Resumo
  let totalReceber = 0;
  let recebidoHoje = 0;
  let clientesDevendo = 0;
  let clientesAtrasados = 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Lista de atividades recentes
  const todasAtividades: Array<{
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
    if (c.total_debt > 0) {
      totalReceber += c.total_debt;
      clientesDevendo += 1;

      const temAtraso = c.history.some(
        (h) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > 15
      );
      if (temAtraso) clientesAtrasados += 1;
    }

    c.history.forEach((h) => {
      todasAtividades.push({
        ...h,
        customerName: c.full_name,
        customerId: c.id,
      });

      if (h.type === 'payment') {
        if (new Date(h.created_at) >= startOfToday) {
          recebidoHoje += h.amount;
        }
      }
    });
  });

  // Ordena feed decrescente
  todasAtividades.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const atividadesRecentes = todasAtividades.slice(0, 6);

  const MetricTile = ({
    title,
    value,
    statusColor,
    valueStyle,
    onPress,
    icon,
  }: {
    title: string;
    value: string;
    statusColor: string;
    valueStyle?: any;
    onPress: () => void;
    icon: React.ComponentProps<typeof Ionicons>['name'];
  }) => {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={[styles.compactCard, { borderLeftColor: statusColor }]}
      >
        <View style={styles.compactRow}>
          <Ionicons name={icon} size={15} color={statusColor} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.compactTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.compactValue, valueStyle]} numberOfLines={1}>
              {value}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredCustomers = searchQuery.trim()
    ? customers.filter(
        (c) =>
          c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.phone && c.phone.includes(searchQuery))
      )
    : [];

  const dashboardSidebar = (
    <View style={styles.sidebarContent}>
      {[
        { label: 'Dashboard', icon: 'home-outline' as const, href: '/home' as const },
        { label: 'Clientes', icon: 'people-outline' as const, href: '/clientes' as const },
        { label: 'Relatórios', icon: 'bar-chart-outline' as const, href: '/relatorios' as const },
        { label: 'Configurações', icon: 'settings-outline' as const, href: '/config' as const },
      ].map((item) => (
        <TouchableOpacity key={item.label} style={styles.sidebarItem} onPress={() => router.push(item.href)}>
          <Ionicons name={item.icon} size={18} color={theme.colors.textMuted} />
          <Text style={styles.sidebarItemText}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const dashboardRightPanel = (
    <View style={styles.rightPanelContent}>
      <Text style={styles.panelTitle}>Resumo da praça</Text>
      <Text style={styles.panelValue}>{clientesAtrasados}</Text>
      <Text style={styles.panelMuted}>clientes com cobrança acima de 15 dias</Text>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <Header showTotal={true} title="Fiado" />

      <AdaptiveContainer
        safeArea={false}
        sidebar={dashboardSidebar}
        rightPanel={dashboardRightPanel}
        contentContainerStyle={styles.scrollContent}
      >
        <AdaptiveGrid minItemWidth={160} maxColumns={4} style={styles.metricsContainer}>
          <MetricTile
            title="Recebido"
            value={formatCurrency(recebidoHoje)}
            statusColor="#3b82f6"
            valueStyle={styles.valBlue}
            onPress={() => router.push('/home-details?kind=todayCollections')}
            icon="cash-outline"
          />
          <MetricTile
            title="A Receber"
            value={formatCurrency(totalReceber)}
            statusColor={theme.colors.primary}
            valueStyle={styles.valGreen}
            onPress={() => router.push('/home-details?kind=balanceFiado')}
            icon="trending-up-outline"
          />
          <MetricTile
            title="Devedores"
            value={String(clientesDevendo)}
            statusColor="#eab308"
            valueStyle={styles.valAmber}
            onPress={() => router.push('/home-details?kind=pendingClients')}
            icon="person-outline"
          />
          <MetricTile
            title="Clientes"
            value={String(customers.length)}
            statusColor="#6366f1"
            valueStyle={styles.valIndigo}
            onPress={() => router.push('/home-details?kind=totalClients')}
            icon="bar-chart-outline"
          />
        </AdaptiveGrid>

        {/* Ações Rápidas - Clientes & Busca */}
        <View style={styles.searchSection}>
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={15} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar cliente..."
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.newCustBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
            onPress={() => router.push('/clientes/novo')}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Resultados de Busca */}
        {searchQuery.trim().length > 0 && (
          <Card style={styles.searchResultsCard}>
            <Text style={styles.searchResultHeader}>
              Resultados ({filteredCustomers.length})
            </Text>
            {filteredCustomers.length === 0 ? (
              <Text style={styles.noResultsText}>Nenhum cliente encontrado.</Text>
            ) : (
              filteredCustomers.map((cust) => (
                <TouchableOpacity
                  key={cust.id}
                  style={styles.searchResultItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSearchQuery('');
                    router.push(`/clientes/${cust.id}`);
                  }}
                >
                  <View style={styles.searchResultLeft}>
                    <Text style={styles.avatarMini}>
                      {cust.full_name.charAt(0).toUpperCase()}
                    </Text>
                    <View>
                      <Text style={styles.searchResultName}>{cust.full_name}</Text>
                      {cust.phone ? <Text style={styles.searchResultPhone}>{cust.phone}</Text> : null}
                    </View>
                  </View>
                  <Text style={styles.searchResultDebt}>
                    {cust.total_debt > 0 ? formatCurrency(cust.total_debt) : 'Sem débito'}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </Card>
        )}

        {/* Linha do Tempo de Atividades Recentes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Últimas Movimentações na Loja</Text>
          <TouchableOpacity onPress={() => router.push('/relatorios')}>
            <Text style={styles.linkText}>Ver Relatórios</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.feedCard}>
          {atividadesRecentes.length === 0 ? (
            <Text style={styles.emptyFeed}>Nenhuma movimentação registrada na loja hoje.</Text>
          ) : (
            atividadesRecentes.map((tx, idx) => {
              const isDebt = tx.type === 'debt';
              const isPay = tx.type === 'payment';
              const timeStr = new Date(tx.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              const iconBg = isDebt ? '#fee2e2' : isPay ? '#d1fae5' : '#f1f5f9';
              const iconColor = isDebt ? theme.colors.accent : isPay ? theme.colors.primaryDark : '#64748b';
              const iconName = isDebt ? 'document-text-outline' : isPay ? 'cash-outline' : 'settings-outline';

              return (
                <View key={tx.id || String(idx)}>
                  <TouchableOpacity
                    style={[styles.feedItem, idx === atividadesRecentes.length - 1 && { borderBottomWidth: 0 }]}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/clientes/${tx.customerId}`)}
                  >
                    <View style={styles.feedLeft}>
                      <View style={[styles.feedIconBadge, { backgroundColor: iconBg }]}>
                        <Ionicons name={iconName as any} size={14} color={iconColor} />
                      </View>
                      <View style={styles.feedTextCol}>
                        <Text style={styles.feedCustName} numberOfLines={1}>
                          {tx.customerName.split(' ')[0]}
                        </Text>
                        <Text style={styles.feedDesc} numberOfLines={1}>
                          {tx.description} •{' '}
                          <Text style={styles.feedAuthorChip}>{tx.created_by || 'Dono'}</Text>
                        </Text>
                      </View>
                    </View>

                    <View style={styles.feedRight}>
                      <Text
                        style={[
                          styles.feedAmt,
                          { color: isDebt ? theme.colors.accent : isPay ? theme.colors.primary : '#64748b' },
                        ]}
                      >
                        {isDebt ? '+' : isPay ? '-' : ''}
                        {formatCurrency(tx.amount)}
                      </Text>
                      <Text style={styles.feedTime}>{timeStr}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </Card>

      </AdaptiveContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 24,
  },
  metricsContainer: {
    marginBottom: 10,
    marginHorizontal: -12,
    paddingHorizontal: 12,
  },
  metricsScroll: {
    paddingRight: 32,
    flexDirection: 'row',
  },
  compactCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginVertical: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactTitle: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  compactValue: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
  valGreen: { color: theme.colors.primaryDark },
  valBlue: { color: '#2563eb' },
  valAmber: { color: '#ca8a04' },
  valIndigo: { color: '#4f46e5' },
  valDark: { color: theme.colors.textMain },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
    color: theme.colors.textMuted,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: theme.colors.textMain,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: 'bold',
  },
  newCustBtn: {
    backgroundColor: theme.colors.primary,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  newCustBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchResultsCard: {
    marginTop: -8,
    marginBottom: 16,
    padding: 10,
    backgroundColor: '#ffffff',
    borderColor: theme.colors.border,
  },
  searchResultHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  noResultsText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  searchResultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryLight,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 8,
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  searchResultPhone: {
    fontSize: 10.5,
    color: theme.colors.textMuted,
  },
  searchResultDebt: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  linkText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  feedCard: {
    padding: 8,
    paddingHorizontal: 12,
  },
  emptyFeed: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  feedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  feedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  feedIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  feedIconEmoji: {
    fontSize: 14,
  },
  feedTextCol: {
    flex: 1,
  },
  feedCustName: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  feedDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  feedAuthorChip: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  feedRight: {
    alignItems: 'flex-end',
  },
  feedAmt: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  feedTime: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  demoResetBtn: {
    marginTop: 24,
    padding: 12,
    alignItems: 'center',
  },
  demoResetText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textDecorationLine: 'underline',
  },
  sidebarContent: {
    padding: 16,
    gap: 8,
  },
  sidebarItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.inputBg,
  },
  sidebarItemText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  rightPanelContent: {
    padding: 18,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  panelValue: {
    marginTop: 10,
    fontSize: 38,
    fontWeight: '900',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
  },
  panelMuted: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
});
