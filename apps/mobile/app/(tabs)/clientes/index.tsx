import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Header, Button, CustomerRow, AnimatedPopup } from '../../../src/components';
import { useFiadoStore } from '../../../src/store';
import { theme } from '../../../src/theme';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export default function ClientesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openAdd?: string }>();
  const {
    customers,
    businessConfig,
    addCustomer,
    subscription,
    getActiveCustomersCount,
  } = useFiadoStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'devendo' | 'atrasados' | 'pagos'>('all');

  // Modal Novo Cliente
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCep, setNewCep] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDocType, setNewDocType] = useState<'cpf' | 'cnpj'>('cpf');
  const [newDocValue, setNewDocValue] = useState('');
  const [newPicture, setNewPicture] = useState('');

  const checkLimitAndOpenAdd = () => {
    const activeCount = getActiveCustomersCount();
    if (!subscription.is_premium && subscription.max_customers !== null && activeCount >= subscription.max_customers) {
      Alert.alert(
        'Limite de Clientes Atingido',
        'O plano gratuito é limitado a 2 clientes ativos. Faça o upgrade para o plano Premium para cadastrar clientes ilimitados.',
        [
          { text: 'Voltar', style: 'cancel' },
          { text: 'Ver Planos', onPress: () => router.push('/subscription') }
        ]
      );
      return;
    }
    setIsAddOpen(true);
  };

  const handleCloseAdd = () => {
    setIsAddOpen(false);
    // If screen was opened via /clientes?openAdd=true, clear the param so it doesn't reopen.
    if (params.openAdd === 'true') {
      router.setParams({ openAdd: undefined } as any);
    }
  };

  useEffect(() => {
    if (params.openAdd === 'true') {
      const activeCount = getActiveCustomersCount();
      if (!subscription.is_premium && subscription.max_customers !== null && activeCount >= subscription.max_customers) {
        Alert.alert(
          'Limite de Clientes Atingido',
          'O plano gratuito é limitado a 2 clientes ativos. Faça o upgrade para o plano Premium para cadastrar clientes ilimitados.',
          [
            { text: 'Voltar', style: 'cancel' },
            { text: 'Ver Planos', onPress: () => router.push('/subscription') }
          ]
        );
      } else {
        setIsAddOpen(true);
      }
      router.setParams({ openAdd: undefined } as any);
    }
  }, [params, subscription]);

  const handleFetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data && !data.erro) {
        const fullAddr = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(', ');
        setNewAddress(fullAddr);
      }
    } catch {
      // silent
    }
  };

  const handleFetchCnpj = async (cnpj: string) => {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data) return;

      const name = data.nome_fantasia || data.razao_social || '';
      const phone = `${data.ddd_telefone_1 || ''}${data.telefone || ''}`.replace(/\D/g, '');
      const cep = (data.cep || '').replace(/\D/g, '');
      const fullAddr = [data.logradouro, data.numero && data.numero !== 'S/N' ? `Nº ${data.numero}` : 'S/N', data.bairro, data.municipio, data.uf]
        .filter(Boolean)
        .join(', ');

      if (name) setNewName(name);
      if (phone) setNewPhone(phone);
      if (cep) {
        setNewCep(cep.substring(0, 8));
        handleFetchCep(cep);
      }
      if (fullAddr) setNewAddress(fullAddr);
    } catch {
      // silent
    }
  };

  const formatDocValue = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (newDocType === 'cpf') {
      return clean
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
        .substring(0, 14);
    }
    return clean
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
      .substring(0, 18);
  };

  const handleDocChange = (val: string) => {
    const formatted = formatDocValue(val);
    setNewDocValue(formatted);
    const clean = formatted.replace(/\D/g, '');
    if (newDocType === 'cnpj' && clean.length === 14) handleFetchCnpj(clean);
  };

  const handleCepChange = (val: string) => {
    const formatted = val.replace(/\D/g, '').substring(0, 8);
    setNewCep(formatted);
    if (formatted.length === 8) handleFetchCep(formatted);
  };

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

  const handleCreateSubmit = () => {
    const name = newName.trim();
    const phoneDigits = (newPhone || '').replace(/\D/g, '');
    const cepDigits = (newCep || '').replace(/\D/g, '');

    if (!name || name.length < 2) {
      Alert.alert('Erro', 'Por favor, informe o nome ou apelido do cliente.');
      return;
    }

    if (phoneDigits && !(phoneDigits.length === 10 || phoneDigits.length === 11)) {
      Alert.alert('Erro', 'WhatsApp inválido. Use DDD + número (10 ou 11 dígitos).');
      return;
    }

    if (cepDigits && cepDigits.length !== 8) {
      Alert.alert('Erro', 'CEP inválido. Use 8 dígitos (apenas números).');
      return;
    }

    const cleanDoc = newDocValue.replace(/\D/g, '');
    const docValueToSave = cleanDoc ? cleanDoc : '';
    const docTypeToSave = docValueToSave ? newDocType : undefined;
    const newCust = addCustomer(name, phoneDigits, cepDigits, newAddress.trim(), docTypeToSave, docValueToSave, newPicture);
    setIsAddOpen(false);
    setNewName('');
    setNewPhone('');
    setNewCep('');
    setNewAddress('');
    setNewDocType('cpf');
    setNewDocValue('');
    setNewPicture('');

    router.push(`/clientes/${newCust.id}`);
  };

  const pickCustomerPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão', 'Permita acesso à galeria para escolher uma foto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setNewPicture(asset.uri);
    } catch {
      Alert.alert('Erro', 'Não foi possível selecionar a foto.');
    }
  };

  return (
    <View style={styles.wrapper}>
      <Header showTotal={false} title="Relação de Clientes" />

      <Animated.View
        entering={FadeInDown.duration(500).springify().damping(15)}
        style={styles.searchContainer}
      >
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

      <Animated.View
        entering={FadeInDown.delay(100).duration(500).springify().damping(15)}
        style={styles.filtersWrapper}
      >
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

      <Animated.View
        entering={FadeInDown.delay(150).duration(500).springify().damping(15)}
        style={styles.listHeader}
      >
        <Text style={styles.listCount}>{filteredCustomers.length} clientes encontrados</Text>
        <TouchableOpacity onPress={checkLimitAndOpenAdd} style={{ flexDirection: 'row', alignItems: 'center' }}>
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
          <Animated.View
            entering={FadeInDown.delay(200 + index * 60).duration(450).springify().damping(16)}
          >
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
              onPress={checkLimitAndOpenAdd}
              style={{ marginTop: 12 }}
            />
          </View>
        )}
      />

      <Animated.View
        entering={FadeInDown.delay(250).duration(500).springify().damping(15)}
        style={styles.footerAdd}
      >
        <Button
          title="Cadastrar Novo Cliente"
          variant="primary"
          size="lg"
          leftIcon={<Ionicons name="add" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
          onPress={checkLimitAndOpenAdd}
        />
      </Animated.View>

      {/* Popup Animado Premium */}
      <AnimatedPopup visible={isAddOpen} onClose={handleCloseAdd}>
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.modalTitle}>Novo Cliente</Text>
          <Text style={styles.modalSub}>Dados opcionais ajudam no extrato e cobranças.</Text>

          <View style={styles.photoRow}>
            <View style={styles.photoPreview}>
              {newPicture ? (
                <Image source={{ uri: newPicture }} style={styles.photoPreviewImg} />
              ) : (
                <Ionicons name="camera-outline" size={24} color={theme.colors.textMuted} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>Foto do Cliente</Text>
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoBtn} onPress={pickCustomerPhoto} activeOpacity={0.8}>
                  <Text style={styles.photoBtnText}>{newPicture ? 'Trocar' : 'Escolher'}</Text>
                </TouchableOpacity>
                {newPicture ? (
                  <TouchableOpacity style={[styles.photoBtn, styles.photoBtnDanger]} onPress={() => setNewPicture('')} activeOpacity={0.8}>
                    <Text style={[styles.photoBtnText, styles.photoBtnTextDanger]}>Remover</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.helperText}>A foto será enviada quando houver internet.</Text>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Nome *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Ex: Dona Maria, Zé do Bar"
              placeholderTextColor={theme.colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, styles.formCol]}>
              <Text style={styles.formLabel}>WhatsApp</Text>
              <TextInput
                style={styles.formInput}
                placeholder="11999999999"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={(v) => setNewPhone(v.replace(/\D/g, '').substring(0, 11))}
              />
            </View>
            <View style={[styles.formGroup, styles.formCol]}>
              <Text style={styles.formLabel}>CEP</Text>
              <TextInput
                style={styles.formInput}
                placeholder="01001000"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                value={newCep}
                onChangeText={handleCepChange}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Documento</Text>
            <View style={styles.radioRow}>
              <TouchableOpacity
                style={[styles.radioButton, newDocType === 'cpf' && styles.radioActive]}
                onPress={() => {
                  setNewDocType('cpf');
                  setNewDocValue('');
                }}
              >
                <Text style={[styles.radioText, newDocType === 'cpf' && styles.radioTextActive]}>CPF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.radioButton, newDocType === 'cnpj' && styles.radioActive]}
                onPress={() => {
                  setNewDocType('cnpj');
                  setNewDocValue('');
                }}
              >
                <Text style={[styles.radioText, newDocType === 'cnpj' && styles.radioTextActive]}>CNPJ</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.formInput}
              placeholder={newDocType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="numeric"
              value={newDocValue}
              onChangeText={handleDocChange}
            />
            <Text style={styles.helperText}>{newDocType === 'cnpj' ? 'Completa 14 dígitos → auto preencher.' : 'Opcional.'}</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Endereço</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Rua, número, bairro, cidade…"
              placeholderTextColor={theme.colors.textMuted}
              value={newAddress}
              onChangeText={setNewAddress}
            />
          </View>

          <Button
            title="Cadastrar"
            variant="primary"
            size="lg"
            leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
            onPress={handleCreateSubmit}
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </AnimatedPopup>
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
