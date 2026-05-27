import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../../../src/components/Button';
import { useDailyDueStore } from '../../../src/store';
import { theme } from '../../../src/theme';
import { useAdaptiveColors, useResponsive } from '../../../src/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NovoClientePage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const layout = useResponsive();
  const colors = useAdaptiveColors();
  const insets = useSafeAreaInsets();

  const { addCustomer, subscription, getActiveCustomersCount } = useDailyDueStore();
  const customersCount = getActiveCustomersCount();

  useEffect(() => {
    if (subscription.max_customers !== null && customersCount >= subscription.max_customers) {
      Alert.alert(
        'Limite do Plano Grátis 🔒',
        'Você atingiu o limite de 2 clientes do plano Grátis. Faça o upgrade para o Premium para obter clientes ilimitados!',
        [
          { text: 'Voltar', onPress: () => router.back(), style: 'cancel' },
          { text: 'Ver Planos', onPress: () => router.replace('/subscription') },
        ],
        { cancelable: false }
      );
    }
  }, [subscription, customersCount]);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCep, setNewCep] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDocType, setNewDocType] = useState<'cpf' | 'cnpj'>('cpf');
  const [newDocValue, setNewDocValue] = useState('');
  const [newPicture, setNewPicture] = useState('');
  const [saving, setSaving] = useState(false);

  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [docStatus, setDocStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');

  const handleFetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepStatus('idle');
      return;
    }
    setCepStatus('loading');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data && !data.erro) {
        const fullAddr = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(', ');
        setNewAddress(fullAddr);
        setCepStatus('valid');
      } else {
        setCepStatus('invalid');
      }
    } catch {
      setCepStatus('invalid');
    }
  };

  const handleFetchCnpj = async (cnpj: string) => {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      setDocStatus('idle');
      return;
    }
    setDocStatus('loading');
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!res.ok) {
        if (isValidCNPJ(cleanCnpj)) {
          setDocStatus('valid');
        } else {
          setDocStatus('invalid');
        }
        return;
      }
      const data = await res.json();
      if (!data) {
        setDocStatus('invalid');
        return;
      }

      const name = data.nome_fantasia || data.razao_social || '';
      const phone = `${data.ddd_telefone_1 || ''}${data.telefone || ''}`.replace(/\D/g, '');
      const cep = (data.cep || '').replace(/\D/g, '');
      const fullAddr = [
        data.logradouro,
        data.numero && data.numero !== 'S/N' ? `Nº ${data.numero}` : 'S/N',
        data.bairro,
        data.municipio,
        data.uf,
      ]
        .filter(Boolean)
        .join(', ');

      if (name) setNewName(name);
      if (phone) setNewPhone(phone);
      if (cep) {
        setNewCep(cep.substring(0, 8));
        handleFetchCep(cep);
      }
      if (fullAddr) setNewAddress(fullAddr);
      setDocStatus('valid');
    } catch {
      if (isValidCNPJ(cleanCnpj)) {
        setDocStatus('valid');
      } else {
        setDocStatus('invalid');
      }
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

  const isValidCPF = (cpf: string) => {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i);
    let rev = 11 - (soma % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(9))) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i);
    rev = 11 - (soma % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(10))) return false;
    return true;
  };

  const isValidCNPJ = (cnpj: string) => {
    cnpj = cnpj.replace(/[^\d]+/g, '');
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(1))) return false;
    return true;
  };

  const formatPhoneValue = (val: string) => {
    let clean = val.replace(/\D/g, '');
    if (clean.length > 11) clean = clean.substring(0, 11);
    if (clean.length === 0) return '';
    if (clean.length <= 2) return `(${clean}`;
    if (clean.length <= 6) return `(${clean.substring(0, 2)}) ${clean.substring(2)}`;
    if (clean.length <= 10) return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`;
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`;
  };

  const handleFetchCpf = async (cpf: string) => {
    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      setDocStatus('idle');
      return;
    }
    setDocStatus('loading');
    try {
      const res = await fetch(`https://api.mix-br.com/cpf/${cleanCpf}`);
      if (!res.ok) throw new Error("API Offline");
      const data = await res.json();
      if (data && data.status === false) {
        setDocStatus('invalid');
        Alert.alert('Ops!', 'CPF inválido de acordo com a validação da API. 📄', [{ text: 'OK' }]);
      } else {
        setDocStatus('valid');
      }
    } catch {
      if (isValidCPF(cleanCpf)) {
        setDocStatus('valid');
      } else {
        setDocStatus('invalid');
        Alert.alert('Ops!', 'CPF inválido. Verifique os números digitados. 📄', [{ text: 'OK' }]);
      }
    }
  };

  const handleDocChange = (val: string) => {
    const formatted = formatDocValue(val);
    setNewDocValue(formatted);
    const clean = formatted.replace(/\D/g, '');
    if (newDocType === 'cnpj' && clean.length === 14) {
      handleFetchCnpj(clean);
    } else if (newDocType === 'cpf' && clean.length === 11) {
      handleFetchCpf(clean);
    } else {
      setDocStatus('idle');
    }
  };

  const handlePhoneChange = (val: string) => {
    setNewPhone(formatPhoneValue(val));
  };

  const handleCepChange = (val: string) => {
    const formatted = val.replace(/\D/g, '').substring(0, 8);
    setNewCep(formatted);
    if (formatted.length === 8) {
      handleFetchCep(formatted);
    } else {
      setCepStatus('idle');
    }
  };

  const pickCustomerPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Acesso Negado', 'Precisamos de permissão para escolher a foto da galeria. 🖼️', [{ text: 'OK' }], { cancelable: true });
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
      Alert.alert('Ops!', 'Não foi possível carregar a imagem. 😅', [{ text: 'OK' }], { cancelable: true });
    }
  };

  const handleCreateSubmit = () => {
    const name = newName.trim();
    const phoneDigits = (newPhone || '').replace(/\D/g, '');
    const cepDigits = (newCep || '').replace(/\D/g, '');

    if (!name || name.length < 2) {
      Alert.alert('Ops!', 'Faltou o nome ou apelido do cliente. 😊', [{ text: 'OK' }], { cancelable: true });
      return;
    }

    if (phoneDigits && !(phoneDigits.length === 10 || phoneDigits.length === 11)) {
      Alert.alert('Ops!', 'Confira o número do celular/WhatsApp. Digite com DDD (ex: 11999999999). 📱', [{ text: 'OK' }], { cancelable: true });
      return;
    }

    if (cepDigits && cepDigits.length !== 8) {
      Alert.alert('Ops!', 'Confira o número do CEP. 📍', [{ text: 'OK' }], { cancelable: true });
      return;
    }

    const cleanDoc = newDocValue.replace(/\D/g, '');
    if (cleanDoc) {
      if (newDocType === 'cpf') {
        if (cleanDoc.length !== 11 || !isValidCPF(cleanDoc)) {
          Alert.alert('Ops!', 'CPF inválido. Verifique os números digitados. 📄', [{ text: 'OK' }], { cancelable: true });
          return;
        }
      }
      if (newDocType === 'cnpj') {
        if (cleanDoc.length !== 14 || !isValidCNPJ(cleanDoc)) {
          Alert.alert('Ops!', 'CNPJ inválido. Verifique os números digitados. 📄', [{ text: 'OK' }], { cancelable: true });
          return;
        }
      }
    }

    const docValueToSave = cleanDoc ? cleanDoc : '';
    const docTypeToSave = docValueToSave ? newDocType : undefined;

    setSaving(true);
    try {
      const newCust = addCustomer(name, phoneDigits, cepDigits, newAddress.trim(), docTypeToSave, docValueToSave, newPicture);

      Alert.alert('Sucesso! 🎉', `Cliente ${name} cadastrado com sucesso.`, [{ text: 'OK' }], { cancelable: true });

      const next = typeof params.next === 'string' ? params.next : '';
      if (next === 'novo-fiado') {
        router.replace(`/novo-fiado?customerId=${newCust.id}`);
      } else {
        router.back();
      }
    } catch (e: any) {
      if (e.message === 'FREE_PLAN_CUSTOMER_LIMIT_REACHED') {
        Alert.alert(
          'Limite do Plano Grátis 🔒',
          'Você atingiu o limite de 2 clientes do plano Grátis. Faça o upgrade para o Premium para obter clientes ilimitados!',
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Ver Planos', onPress: () => router.push('/subscription') },
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert('Ops!', 'Não foi possível salvar o cliente. 😅', [{ text: 'OK' }], { cancelable: true });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.topBarInner, { maxWidth: layout.formMaxWidth + layout.spacing.screen * 2 }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: colors.text }]}>Novo Cliente</Text>
          <TouchableOpacity onPress={() => router.push('/subscription')} style={styles.badgeBtn} activeOpacity={0.7}>
            <View style={styles.badge}>
              <Ionicons name={subscription.is_premium ? 'star' : 'leaf'} size={10} color="#fff" />
              <Text style={styles.badgeText}>{subscription.is_premium ? 'PRO' : 'GRÁTIS'}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            {
              maxWidth: layout.formMaxWidth,
              alignSelf: 'center',
              width: '100%',
              paddingHorizontal: layout.spacing.screen,
              paddingBottom: layout.spacing.xl + insets.bottom + 24,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.photoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.photoRow}>
              <View style={[styles.photoPreview, { backgroundColor: colors.mutedSurface, borderColor: colors.border }]}>
                {newPicture ? (
                  <Image source={{ uri: newPicture }} style={styles.photoPreviewImg} />
                ) : (
                  <Ionicons name="camera-outline" size={26} color={theme.colors.textMuted} />
                )}
                <View style={styles.photoBadge}>
                  <Ionicons name={newPicture ? 'checkmark' : 'add'} size={11} color="#ffffff" />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Foto do Cliente</Text>
                <View style={styles.photoActions}>
                  <TouchableOpacity
                    style={[styles.photoBtn, styles.photoBtnPrimary]}
                    onPress={pickCustomerPhoto}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="images-outline" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={[styles.photoBtnText, styles.photoBtnTextPrimary]}>
                      {newPicture ? 'Trocar' : 'Escolher'}
                    </Text>
                  </TouchableOpacity>
                  {newPicture ? (
                    <TouchableOpacity style={[styles.photoBtn, styles.photoBtnDanger]} onPress={() => setNewPicture('')} activeOpacity={0.8}>
                      <Ionicons name="trash-outline" size={14} color={theme.colors.dangerText} style={{ marginRight: 6 }} />
                      <Text style={[styles.photoBtnText, styles.photoBtnTextDanger]}>Remover</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={styles.helperText}>
                  {newPicture ? 'Foto selecionada. Será enviada quando houver internet.' : 'Adicione uma foto para reconhecer o cliente mais rápido.'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Nome *</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
              placeholder="Ex: Dona Maria, Zé do Bar"
              placeholderTextColor={theme.colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, styles.formCol]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>WhatsApp</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
                placeholder="(11) 99999-9999"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={handlePhoneChange}
              />
            </View>
            <View style={[styles.formGroup, styles.formCol]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.formLabel, { color: colors.text }]}>CEP</Text>
                {cepStatus === 'loading' && <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '500' }}>Buscando... ⏳</Text>}
                {cepStatus === 'valid' && <Text style={{ fontSize: 11, color: '#059669', fontWeight: '500' }}>Válido ✓</Text>}
                {cepStatus === 'invalid' && <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '500' }}>Inexistente ✗</Text>}
              </View>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
                placeholder="01001000"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                value={newCep}
                onChangeText={handleCepChange}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Documento</Text>
              {docStatus === 'loading' && <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '500' }}>Validando... ⏳</Text>}
              {docStatus === 'valid' && <Text style={{ fontSize: 11, color: '#059669', fontWeight: '500' }}>Válido ✓</Text>}
              {docStatus === 'invalid' && <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '500' }}>Inválido ✗</Text>}
            </View>
            <View style={styles.radioRow}>
              <TouchableOpacity
                style={[styles.radioButton, newDocType === 'cpf' && styles.radioActive]}
                onPress={() => {
                  setNewDocType('cpf');
                  setNewDocValue('');
                  setDocStatus('idle');
                }}
              >
                <Text style={[styles.radioText, newDocType === 'cpf' && styles.radioTextActive]}>CPF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.radioButton, newDocType === 'cnpj' && styles.radioActive]}
                onPress={() => {
                  setNewDocType('cnpj');
                  setNewDocValue('');
                  setDocStatus('idle');
                }}
              >
                <Text style={[styles.radioText, newDocType === 'cnpj' && styles.radioTextActive]}>CNPJ</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
              placeholder={newDocType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="numeric"
              value={newDocValue}
              onChangeText={handleDocChange}
            />
            <Text style={styles.helperText}>{newDocType === 'cnpj' ? 'Completa 14 dígitos → auto preencher.' : 'Opcional.'}</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Endereço</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.mutedSurface, borderColor: colors.border, color: colors.text }]}
              placeholder="Rua, número, bairro, cidade…"
              placeholderTextColor={theme.colors.textMuted}
              value={newAddress}
              onChangeText={setNewAddress}
            />
          </View>

          <Button
            title={saving ? 'Cadastrando...' : 'Cadastrar'}
            variant="primary"
            size="lg"
            leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />}
            onPress={handleCreateSubmit}
            disabled={saving}
            style={{ marginTop: 8 }}
          />
          {subscription.max_customers !== null ? (
            <Text style={styles.limitText}>
              Limite do plano: {getActiveCustomersCount()}/{subscription.max_customers}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  topBarInner: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  badgeBtn: {
    paddingLeft: 6,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 4,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 12,
  },
  photoCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    marginBottom: 16,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  photoPreviewImg: {
    width: '100%',
    height: '100%',
  },
  photoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  photoBtn: {
    paddingHorizontal: 10,
    minHeight: 38,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  photoBtnDanger: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  photoBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  photoBtnTextPrimary: {
    color: '#ffffff',
  },
  photoBtnTextDanger: {
    color: theme.colors.dangerText,
  },
  helperText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 15,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  formCol: {
    flexGrow: 1,
    flexBasis: 220,
  },
  radioRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  radioButton: {
    paddingHorizontal: 16,
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  radioText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMain,
  },
  radioTextActive: {
    color: '#ffffff',
  },
  limitText: {
    marginTop: 10,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
