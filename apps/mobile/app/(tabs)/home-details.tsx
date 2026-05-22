import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Card } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { formatCurrency } from '../../src/utils';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';

type Kind = 'todayCollections' | 'balanceFiado' | 'pendingClients' | 'totalClients';

function normalizeKind(input: unknown): Kind {
  const raw = String(input || '').trim();
  if (raw === 'todayCollections' || raw === 'balanceFiado' || raw === 'pendingClients' || raw === 'totalClients') return raw;
  return 'pendingClients';
}

export default function HomeDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const kind = normalizeKind(params.kind);
  const { customers } = useFiadoStore();

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const pendingCustomers = useMemo(() => {
    return [...customers]
      .filter((c) => (c.total_debt || 0) > 0)
      .sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0));
  }, [customers]);

  const allCustomersSorted = useMemo(() => {
    return [...customers].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [customers]);

  const todayPayments = useMemo(() => {
    const rows: Array<{ id: string; customerId: string; customerName: string; amount: number; created_at: string; description: string }> =
      [];
    customers.forEach((c) => {
      c.history.forEach((h) => {
        if (h.type !== 'payment') return;
        const dt = new Date(h.created_at);
        if (dt < startOfToday) return;
        rows.push({
          id: h.id,
          customerId: c.id,
          customerName: c.full_name,
          amount: h.amount,
          created_at: h.created_at,
          description: h.description,
        });
      });
    });
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return rows;
  }, [customers, startOfToday]);

  const title =
    kind === 'todayCollections'
      ? 'Recebido Hoje'
      : kind === 'balanceFiado'
        ? 'Saldo a Receber'
        : kind === 'pendingClients'
          ? 'Clientes Devendo'
          : 'Total de Clientes';

  return (
    <View style={styles.wrapper}>
      <Header
        showTotal={false}
        title={title}
        leftAction={
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 12, paddingVertical: 4, paddingRight: 4 }}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          {kind === 'todayCollections' ? (
            todayPayments.length === 0 ? (
              <Text style={styles.empty}>Sem pagamentos hoje.</Text>
            ) : (
              todayPayments.map((tx, idx) => {
                const timeStr = new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <Pressable
                    key={`${tx.id}-${idx}`}
                    onPress={() => router.push(`/clientes/${tx.customerId}`)}
                    android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed, idx === todayPayments.length - 1 && styles.rowLast]}
                  >
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {tx.customerName}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {tx.description} • {timeStr}
                      </Text>
                    </View>
                    <Text style={[styles.rowRight, { color: theme.colors.primaryDark }]}>
                      {formatCurrency(tx.amount)}
                    </Text>
                  </Pressable>
                );
              })
            )
          ) : null}

          {kind === 'balanceFiado' || kind === 'pendingClients' ? (
            pendingCustomers.length === 0 ? (
              <Text style={styles.empty}>Ninguém devendo no momento.</Text>
            ) : (
              pendingCustomers.map((c, idx) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`/clientes/${c.id}`)}
                  android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed, idx === pendingCustomers.length - 1 && styles.rowLast]}
                >
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {c.full_name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {c.phone || 'Sem celular'}
                    </Text>
                  </View>
                  <Text style={[styles.rowRight, { color: theme.colors.accent }]}>{formatCurrency(c.total_debt)}</Text>
                </Pressable>
              ))
            )
          ) : null}

          {kind === 'totalClients' ? (
            allCustomersSorted.length === 0 ? (
              <Text style={styles.empty}>Nenhum cliente cadastrado.</Text>
            ) : (
              allCustomersSorted.map((c, idx) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`/clientes/${c.id}`)}
                  android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed, idx === allCustomersSorted.length - 1 && styles.rowLast]}
                >
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {c.full_name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {c.phone || 'Sem celular'}
                    </Text>
                  </View>
                  <Text style={[styles.rowRight, { color: theme.colors.textMuted, fontFamily: undefined }]}>Ver</Text>
                </Pressable>
              ))
            )
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { padding: 8, paddingHorizontal: 12 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, paddingVertical: 18, fontSize: 13, fontWeight: '600' },
  row: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { opacity: 0.96, transform: [{ scale: 0.995 }] },
  rowLeft: { flex: 1, marginRight: 10 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.textMain },
  rowSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  rowRight: { fontSize: 14, fontWeight: '900', fontFamily: 'Outfit' },
});
