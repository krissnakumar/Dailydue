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
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { AnimatedPopup } from './AnimatedPopup';
import { Button } from './Button';
import { useFiadoStore } from '../store';
import { theme } from '../theme';
import { Ionicons } from '@expo/vector-icons';

export function NovoClientePopup() {
  const router = useRouter();
  const { addCustomer, subscription, getActiveCustomersCount, novoClienteState, closeNovoCliente } = useFiadoStore();

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCep, setNewCep] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDocType, setNewDocType] = useState<'cpf' | 'cnpj'>('cpf');
  const [newDocValue, setNewDocValue] = useState('');
  const [newPicture, setNewPicture] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (novoClienteState.isOpen) {
      setNewName('');
      setNewPhone('');
      setNewCep('');
      setNewAddress('');
      setNewDocType('cpf');
      setNewDocValue('');
      setNewPicture('');
    }
  }, [novoClienteState.isOpen]);

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
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
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

  const handleDocChange = (val: string) => {
    const formatted = formatDocValue(val);
    setNewDocValue(formatted);
    const clean = formatted.replace(/\D/g, '');
    if (newDocType === 'cnpj' && clean.length === 14) handleFetchCnpj(clean);
  };

  const handlePhoneChange = (val: string) => {
    setNewPhone(formatPhoneValue(val));
  };

  const handleCepChange = (val: string) => {
    const formatted = val.replace(/\D/g, '').substring(0, 8);
    setNewCep(formatted);
    if (formatted.length === 8) handleFetchCep(formatted);
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
        closeNovoCliente();
        Alert.alert('Sucesso! 🎉', `Cliente ${name} cadastrado com sucesso.`, [{ text: 'OK' }], { cancelable: true });
    } catch(e: any) {
        if (e.message === 'FREE_PLAN_CUSTOMER_LIMIT_REACHED') {
          Alert.alert(
            'Plano Básico 🔒',
            'Limite de clientes atingido. Mude para o Premium!',
            [
              { text: 'Depois', style: 'cancel' },
              { text: 'Ver Planos', onPress: () => { closeNovoCliente(); router.push('/subscription'); } }
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
  return (
    <AnimatedPopup visible={novoClienteState.isOpen} onClose={closeNovoCliente}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.modalTitle}>Novo Cliente</Text>
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
              placeholder="(11) 99999-9999"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              value={newPhone}
              onChangeText={handlePhoneChange}
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
  );
}

const styles = StyleSheet.create({
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginBottom: 16,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  photoPreviewImg: {
    width: '100%',
    height: '100%',
  },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  photoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    marginRight: 8,
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
    height: 44,
    fontSize: 15,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formCol: {
    flex: 0.48,
  },
  radioRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  radioButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    marginRight: 8,
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
});
