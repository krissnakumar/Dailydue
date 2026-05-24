import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Button, CustomerRow } from '../../../src/components';
import { useFiadoStore } from '../../../src/store';
import { theme } from '../../../src/theme';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export default function ClientesScreen() {
  const router = useRouter();
  const {
    customers,
    businessConfig,
    subscription,
  } = useFiadoStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'devendo' | 'atrasados' | 'pagos'>('all');

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

  return (
    <View style={styles.wrapper}>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
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
        </ScrollView>
      </Animated.View>

      <Animated.View style={styles.listHeader}>
        <Text style={styles.listCount}>{filteredCustomers.length} clientes encontrados</Text>
        <TouchableOpacity onPress={() => router.push('/clientes/novo')} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="add" size={14} color={theme.colors.primary} style={{ marginRight: 2 }} />
          <Text style={styles.quickAddText}>Cadastrar</Text>
        </TouchableOpacity>
      </Animated.View>

      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Animated.View>
            <CustomerRow
              customer={item}
              pixKey={businessConfig.pixKey}
              onPress={() => router.push(`/clientes/${item.id}`)}
              onSwipeLeft={() => router.push(`/pagamentos?customerId=${item.id}`)}
              onSwipeRight={() => router.push(`/novo-fiado?customerId=${item.id}`)}
            />
          </Animated.View>
        )}
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

      <Animated.View style={styles.footerAdd}>
        <Button
          title="Cadastrar Novo Cliente"
          variant="primary"
          size="lg"
          leftIcon={<Ionicons name="add" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
          onPress={() => router.push('/clientes/novo')}
        />
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
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
    height: 44,
    marginBottom: 4,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  filterTab: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    marginRight: 6,
    height: 32,
    justifyContent: 'center',
  },
  filterActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
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
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  footerAdd: {
    padding: 16,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
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
