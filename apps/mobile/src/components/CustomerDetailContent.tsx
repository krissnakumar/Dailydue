import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Card } from './Card';
import { Button } from './Button';
import { useFiadoStore, HistoryItem } from '../store';
import { formatCurrency, sendWhatsappReminder, generateStatementPDF } from '../utils';
import { theme } from '../theme';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

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

export interface CustomerDetailContentProps {
  id: string;
  showBackButton?: boolean;
  onBack?: () => void;
  onDeleteSuccess?: () => void;
}

export function CustomerDetailContent({
  id,
  showBackButton = true,
  onBack,
  onDeleteSuccess,
}: CustomerDetailContentProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    customers,
    customerIdMap,
    businessConfig,
    subscription,
    editCustomer,
    deleteCustomer,
    editHistoryItem,
    deleteHistoryItem,
  } = useFiadoStore();

  const customer = customers.find((c) => c.id === id);
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    if (customer) return;
    if (redirectingRef.current) return;
    const mapped = customerIdMap?.[String(id)];
    if (mapped) {
      redirectingRef.current = true;
      router.replace(`/clientes/${mapped}`);
    }
  }, [id, customer, customerIdMap, router]);

  // Modal Edição Perfil
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCep, setEditCep] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDocType, setEditDocType] = useState<'cpf' | 'cnpj'>('cpf');
  const [editDocValue, setEditDocValue] = useState('');
  const [editPicture, setEditPicture] = useState('');

  // Modal Edição Item Histórico
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [itemDesc, setItemDesc] = useState('');
  const [itemAmt, setItemAmt] = useState('');

  // Helpers de Auto-busca de CEP e CNPJ
  const handleFetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data && !data.erro) {
        const fullAddr = [
          data.logradouro,
          data.bairro,
          data.localidade,
          data.uf
        ].filter(Boolean).join(', ');
        setEditAddress(fullAddr);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFetchCnpj = async (cnpj: string) => {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      if (data) {
        const name = data.nome_fantasia || data.razao_social || '';
        const phone = `${data.ddd_telefone_1 || ''}${data.telefone || ''}`.replace(/\D/g, '');
        const cep = (data.cep || '').replace(/\D/g, '');
        const fullAddr = [
          data.logradouro,
          data.numero && data.numero !== 'S/N' ? `Nº ${data.numero}` : 'S/N',
          data.bairro,
          data.municipio,
          data.uf
        ].filter(Boolean).join(', ');

        if (name) setEditName(name);
        if (phone) setEditPhone(phone);
        if (cep) {
          setEditCep(cep);
          handleFetchCep(cep);
        }
        if (fullAddr) setEditAddress(fullAddr);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const formatDocValue = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (editDocType === 'cpf') {
      return clean
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
        .substring(0, 14);
    } else {
      return clean
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
        .substring(0, 18);
    }
  };

  const handleDocChange = (val: string) => {
    const formatted = formatDocValue(val);
    setEditDocValue(formatted);
    const clean = formatted.replace(/\D/g, '');
    if (editDocType === 'cnpj' && clean.length === 14) {
      handleFetchCnpj(clean);
    }
  };

  const handleCepChange = (val: string) => {
    const formatted = val.replace(/\D/g, '').substring(0, 8);
    setEditCep(formatted);
    if (formatted.length === 8) {
      handleFetchCep(formatted);
    }
  };

  const handlePrintStatement = async () => {
    if (!customer) return;
    try {
      await generateStatementPDF(
        customer.full_name,
        customer.total_debt,
        customer.history,
        customer.address,
        customer.cep,
        customer.documentType,
        customer.documentValue,
        customer.phone,
        businessConfig.businessName,
        businessConfig.pixKey
      );
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível gerar o extrato PDF.');
    }
  };

  if (!customer) {
    return (
      <View style={[styles.wrapper, styles.center]}>
        <Text style={styles.errorText}>Cliente não encontrado ou excluído.</Text>
        {showBackButton && (
          <Button title="Voltar" onPress={() => { if (onBack) onBack(); else router.back(); }} style={{ marginTop: 12 }} />
        )}
      </View>
    );
  }

  const isZero = customer.total_debt === 0;
  const isAtrasado = customer.history.some(
    (h) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > 15
  );
  const canEditProfilePicture = subscription.is_premium;

  const handleOpenEditProfile = () => {
    setEditName(customer.full_name);
    setEditPhone(customer.phone || '');
    setEditCep(customer.cep || '');
    setEditAddress(customer.address || '');
    setEditDocType(customer.documentType || 'cpf');
    setEditDocValue(customer.documentValue || '');
    setEditPicture(customer.picture || '');
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = () => {
    const name = editName.trim();
    const phoneDigits = (editPhone || '').replace(/\D/g, '');
    const cepDigits = (editCep || '').replace(/\D/g, '');

    if (!name || name.length < 2) {
      Alert.alert('Ops!', 'Faltou o nome do cliente. 😊');
      return;
    }
    if (phoneDigits && !(phoneDigits.length === 10 || phoneDigits.length === 11)) {
      Alert.alert('Ops!', 'Confira o número do WhatsApp. 📱');
      return;
    }
    if (cepDigits && cepDigits.length !== 8) {
      Alert.alert('Ops!', 'Confira o número do CEP. 📍');
      return;
    }

    editCustomer(
      customer.id,
      name,
      phoneDigits,
      cepDigits,
      editAddress.trim(),
      editDocType,
      editDocValue.replace(/\D/g, ''),
      editPicture
    );
    setIsEditProfileOpen(false);
  };

  const pickEditPhoto = async () => {
    if (!canEditProfilePicture) {
      Alert.alert('Recurso Premium', 'Fotos reais no perfil do cliente estão disponíveis no plano Premium.', [
        { text: 'Depois', style: 'cancel' },
        { text: 'Ver Planos', onPress: () => router.push('/subscription') },
      ]);
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Acesso Negado', 'Precisamos de permissão para escolher a foto. 🖼️');
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
      setEditPicture(asset.uri);
    } catch {
      Alert.alert('Ops!', 'Não foi possível carregar a imagem. 😅');
    }
  };

  const pickAndSaveProfilePhoto = async () => {
    if (!canEditProfilePicture) {
      Alert.alert('Recurso Premium', 'Assine o Premium para colocar foto real no perfil do cliente.', [
        { text: 'Depois', style: 'cancel' },
        { text: 'Ver Planos', onPress: () => router.push('/subscription') },
      ]);
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Acesso Negado', 'Precisamos de permissão para escolher a foto. 🖼️');
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

      editCustomer(
        customer.id,
        customer.full_name,
        customer.phone || '',
        customer.cep || '',
        customer.address || '',
        customer.documentType || 'cpf',
        customer.documentValue || '',
        asset.uri
      );
    } catch {
      Alert.alert('Ops!', 'Não foi possível atualizar a foto agora. 😅');
    }
  };

  const handleDeleteProfile = () => {
    Alert.alert(
      'Atenção Crítica',
      `Deseja realmente excluir "${customer.full_name}" permanentemente?\n\nTodo o histórico de anotações será estornado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Excluir',
          style: 'destructive',
          onPress: () => {
            deleteCustomer(customer.id);
            if (onDeleteSuccess) {
              onDeleteSuccess();
            } else {
              router.replace('/clientes');
            }
          },
        },
      ]
    );
  };

  const handleOpenEditItem = (item: HistoryItem) => {
    setSelectedItem(item);
    setItemDesc(item.description);
    setItemAmt(item.amount.toString());
  };

  const handleSaveItemEdit = () => {
    if (!selectedItem) return;
    const amt = parseFloat(itemAmt.replace(',', '.'));
    if (isNaN(amt) || amt < 0) {
      Alert.alert('Erro', 'Informe um valor numérico válido.');
      return;
    }
    editHistoryItem(customer.id, selectedItem.id, itemDesc, amt);
    setSelectedItem(null);
  };

  const handleDeleteItem = (itemId: string) => {
    Alert.alert('Confirmar Estorno', 'Deseja remover este lançamento e recalcular a caderneta?', [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, Estornar',
        style: 'destructive',
        onPress: () => deleteHistoryItem(customer.id, itemId),
      },
    ]);
  };

  const triggerWhatsappNotice = () => {
    sendWhatsappReminder({
      customerName: customer.full_name,
      totalDebt: customer.total_debt,
      lastItems: customer.history.map((h) => ({ description: h.description, amount: h.amount })),
      phone: customer.phone,
      pixKey: businessConfig.pixKey,
      businessName: businessConfig.businessName,
    });
  };

  // Calcula saldos remanescentes retroativamente para auditoria na timeline
  const historyWithBalances = React.useMemo(() => {
    let currentBalance = customer.total_debt;
    return customer.history.map(item => {
      const balAtThisPoint = currentBalance;
      if (item.type === 'debt') currentBalance -= item.amount;
      if (item.type === 'payment') currentBalance += item.amount;
      return { ...item, balAtThisPoint };
    });
  }, [customer.history, customer.total_debt]);

  return (
    <ScrollView
      style={styles.wrapper}
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho da Visão Interna */}
      <Animated.View
        entering={FadeInDown.duration(0)}
        style={[styles.headerContainer, { paddingTop: showBackButton ? Math.max(insets.top, 16) : 16 }]}
      >
        {showBackButton && (
          <TouchableOpacity style={styles.backBtn} onPress={() => { if (onBack) onBack(); else router.back(); }}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textMain} />
          </TouchableOpacity>
        )}

        <View style={styles.headerInfo}>
          <TouchableOpacity
            style={styles.avatarMini}
            activeOpacity={0.8}
            onPress={pickAndSaveProfilePhoto}
            accessibilityRole="button"
            accessibilityLabel={canEditProfilePicture ? 'Editar foto do cliente' : 'Foto premium do cliente'}
          >
            {customer.picture ? (
              isEmoji(customer.picture) ? (
                <Text style={styles.avatarEmoji}>{customer.picture}</Text>
              ) : (
                <Image source={{ uri: customer.picture }} style={styles.avatarMiniImage} />
              )
            ) : (
              <Ionicons name="person-outline" size={16} color={theme.colors.primary} />
            )}
            <View style={[styles.avatarEditBadge, !canEditProfilePicture && styles.avatarEditBadgeLocked]}>
              <Ionicons
                name={canEditProfilePicture ? 'camera' : 'lock-closed'}
                size={10}
                color="#ffffff"
              />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.custName} numberOfLines={1}>
              {customer.full_name}
            </Text>
            <Text style={styles.custPhone}>
              {customer.phone ? `WhatsApp: +55 ${customer.phone}` : 'Sem celular cadastrado'}
            </Text>
            {customer.documentValue ? (
              <View style={styles.custSubRow}>
                <Ionicons name="card-outline" size={12} color={theme.colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={styles.custSubText}>
                  {customer.documentType?.toUpperCase() || 'DOCUMENTO'}: {customer.documentValue}
                </Text>
              </View>
            ) : null}
            {customer.address ? (
              <View style={styles.custSubRow}>
                <Ionicons name="location-outline" size={12} color={theme.colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={styles.custSubText} numberOfLines={1}>
                  {customer.address}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.badge,
            { backgroundColor: isZero ? '#d1fae5' : isAtrasado ? '#fee2e2' : '#fef9c3' },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: isZero ? '#065f46' : isAtrasado ? '#991b1b' : '#854d0e' },
            ]}
          >
            {isZero ? 'Quitado' : isAtrasado ? 'Atrasado' : 'Devendo'}
          </Text>
        </View>
      </Animated.View>

      {/* Cartão de Dívida Total Destacada */}
      <Animated.View
        entering={FadeInDown.delay(0).duration(0)}
        style={styles.summaryBoxWrapper}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Quanto Deve Atualmente</Text>
          <Text style={styles.summaryAmount}>{formatCurrency(customer.total_debt)}</Text>
        </View>
      </Animated.View>

      {/* Sticky Quick Actions Row Preservando a Hierarquia Visual */}
      <Animated.View
        entering={FadeInDown.delay(0).duration(0)}
        style={styles.stickyActions}
      >
        <Text style={styles.quickLabel}>Ações Rápidas</Text>
        <View style={styles.gridActionsRow}>
          <TouchableOpacity
            style={[styles.btnActionFiado, styles.rowCenter]}
            onPress={() => router.push(`/novo-fiado?customerId=${customer.id}`)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={14} color={theme.colors.accent} style={{ marginRight: 4 }} />
            <Text style={styles.textActionFiado}>Fiado</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnActionPay, styles.rowCenter]}
            onPress={() => router.push(`/pagamentos?customerId=${customer.id}`)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle-outline" size={14} color={theme.colors.primaryDark} style={{ marginRight: 4 }} />
            <Text style={styles.textActionPay}>Pagamento</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnActionNotice, styles.rowCenter]}
            onPress={triggerWhatsappNotice}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0369a1" style={{ marginRight: 4 }} />
            <Text style={styles.textActionNotice}>Aviso</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.btnActionPrint, styles.rowCenter]} 
          onPress={handlePrintStatement} 
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={15} color="#334155" style={{ marginRight: 6 }} />
          <Text style={styles.textActionPrint}>Gerar Extrato PDF</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(0).duration(0)} style={styles.profileDetailsWrap}>
        <Card style={styles.profileDetailsCard}>
          <View style={styles.profileDetailsHeader}>
            <View>
              <Text style={styles.profileDetailsTitle}>Perfil do Cliente</Text>
              <Text style={styles.profileDetailsSub}>Dados salvos no cadastro</Text>
            </View>
            <TouchableOpacity style={[styles.profileEditLink, styles.rowCenter]} onPress={handleOpenEditProfile} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={14} color={theme.colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.profileEditLinkText}>Editar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.profileDetailsGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Nome</Text>
              <Text style={styles.detailValue} numberOfLines={2}>{customer.full_name || 'Não informado'}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>WhatsApp</Text>
              <Text style={styles.detailValue}>{customer.phone ? `+55 ${customer.phone}` : 'Não informado'}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Documento</Text>
              <Text style={styles.detailValue}>
                {customer.documentValue
                  ? `${customer.documentType?.toUpperCase() || 'DOC'} ${customer.documentValue}`
                  : 'Não informado'}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>CEP</Text>
              <Text style={styles.detailValue}>{customer.cep || 'Não informado'}</Text>
            </View>
            <View style={[styles.detailItem, styles.detailItemFull]}>
              <Text style={styles.detailLabel}>Endereço</Text>
              <Text style={styles.detailValue} numberOfLines={3}>{customer.address || 'Não informado'}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* Scrollable Timeline (Folha de Caderno) */}
      <View style={styles.timelineScroll}>
        <Animated.View
          entering={FadeInDown.delay(0).duration(0)}
          style={styles.timelineHeader}
        >
          <Text style={styles.timelineTitle}>Linha do Tempo (Histórico)</Text>
          <Text style={styles.timelineSub}>Auditoria Completa</Text>
        </Animated.View>

        <View style={styles.timelineWrapper}>
          {historyWithBalances.length === 0 ? (
            <Text style={styles.emptyTimeline}>Nenhum registro no caderno de auditoria.</Text>
          ) : (
            historyWithBalances.map((item, index) => {
              const isDebt = item.type === 'debt';
              const isPay = item.type === 'payment';
              const isSys = item.type === 'system';

              const dtStr = new Date(item.created_at).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });

              // Saldo remanescente em cada etapa do passado
              const balAtThisPoint = item.balAtThisPoint;

              return (
                <Animated.View
                  key={item.id || String(index)}
                  entering={FadeInRight.delay(0).duration(0)}
                  style={styles.timelineNode}
                >
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: isDebt
                          ? theme.colors.accent
                          : isPay
                          ? theme.colors.primary
                          : '#64748b',
                      },
                    ]}
                  />

                  <View style={styles.nodeBox}>
                    <View style={styles.nodeTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {isDebt ? (
                          <Ionicons name="add-circle-outline" size={13} color={theme.colors.accent} style={{ marginRight: 4 }} />
                        ) : isPay ? (
                          <Ionicons name="checkmark-circle-outline" size={13} color={theme.colors.primary} style={{ marginRight: 4 }} />
                        ) : (
                          <Ionicons name="alert-circle-outline" size={13} color="#475569" style={{ marginRight: 4 }} />
                        )}
                        <Text
                          style={[
                            styles.nodeType,
                            {
                              color: isDebt
                                ? theme.colors.accent
                                : isPay
                                ? theme.colors.primary
                                : '#475569',
                            },
                          ]}
                        >
                          {isDebt ? 'Lançamento' : isPay ? 'Pagamento' : 'Sistema'}
                        </Text>
                      </View>
                      <Text style={styles.nodeAmount}>
                        {item.amount > 0 ? formatCurrency(item.amount) : ''}
                      </Text>
                    </View>

                    <Text style={styles.nodeDesc}>{item.description}</Text>

                    <View style={styles.nodeMetaRow}>
                      <Text style={styles.nodeMetaText}>
                        {dtStr} • Por <Text style={{ fontWeight: 'bold' }}>{item.created_by || 'Dono'}</Text>
                      </Text>
                      <Text style={styles.nodeBalText}>Saldo: {formatCurrency(balAtThisPoint)}</Text>
                    </View>

                    {!isSys && (
                      <View style={styles.nodeEditRow}>
                        <TouchableOpacity onPress={() => handleOpenEditItem(item)} style={[styles.nodeBtn, styles.rowCenter]}>
                          <Ionicons name="pencil-outline" size={11} color={theme.colors.textMuted} style={{ marginRight: 3 }} />
                          <Text style={styles.nodeBtnText}>Ajustar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => handleDeleteItem(item.id)} style={[styles.nodeBtn, styles.rowCenter]}>
                          <Ionicons name="trash-outline" size={11} color={theme.colors.dangerText} style={{ marginRight: 3 }} />
                          <Text style={styles.nodeBtnTextRed}>Estornar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>

        {/* Botão Inferior de Remoção Permanente */}
        <TouchableOpacity style={styles.deleteProfileWrapper} onPress={handleDeleteProfile}>
          <Text style={styles.deleteProfileText}>Excluir Cadastro Permanentemente</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Edição do Cliente */}
      <Modal
        visible={isEditProfileOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsEditProfileOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Editar Perfil</Text>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nome do Cliente *</Text>
                <TextInput style={styles.formInput} value={editName} onChangeText={setEditName} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>WhatsApp</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="phone-pad"
                  value={editPhone}
                  onChangeText={setEditPhone}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tipo de Documento</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={[styles.radioButton, editDocType === 'cpf' && styles.radioActive]}
                    onPress={() => {
                      setEditDocType('cpf');
                      setEditDocValue('');
                    }}
                  >
                    <Text style={[styles.radioText, editDocType === 'cpf' && styles.radioTextActive]}>CPF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioButton, editDocType === 'cnpj' && styles.radioActive]}
                    onPress={() => {
                      setEditDocType('cnpj');
                      setEditDocValue('');
                    }}
                  >
                    <Text style={[styles.radioText, editDocType === 'cnpj' && styles.radioTextActive]}>CNPJ</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Documento ({editDocType.toUpperCase()})</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  placeholder={editDocType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                  value={editDocValue}
                  onChangeText={handleDocChange}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>CEP</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  placeholder="00000-000"
                  value={editCep}
                  onChangeText={handleCepChange}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Endereço Completo</Text>
                <TextInput
                  style={[styles.formInput, { height: 75, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                  value={editAddress}
                  onChangeText={setEditAddress}
                />
              </View>

              {canEditProfilePicture ? (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Foto do Cliente</Text>
                  <View style={styles.photoRow}>
                    <View style={styles.photoPreview}>
                      {editPicture && !isEmoji(editPicture) ? (
                        <Image source={{ uri: editPicture }} style={styles.photoPreviewImg} />
                      ) : editPicture && isEmoji(editPicture) ? (
                        <Text style={styles.photoPreviewText}>{editPicture}</Text>
                      ) : (
                        <Ionicons name="camera-outline" size={24} color={theme.colors.textMuted} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.photoActions}>
                        <TouchableOpacity style={styles.photoBtn} onPress={pickEditPhoto} activeOpacity={0.8}>
                          <Text style={styles.photoBtnText}>{editPicture && !isEmoji(editPicture) ? 'Trocar' : 'Escolher'}</Text>
                        </TouchableOpacity>
                        {editPicture ? (
                          <TouchableOpacity
                            style={[styles.photoBtn, styles.photoBtnDanger]}
                            onPress={() => setEditPicture('')}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.photoBtnText, styles.photoBtnTextDanger]}>Remover</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={styles.photoHint}>Se escolher foto, ela será enviada quando houver internet.</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.photoPremiumBox}
                  onPress={() => router.push('/subscription')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="lock-closed-outline" size={16} color={theme.colors.accent} style={{ marginRight: 8 }} />
                  <Text style={styles.photoPremiumText}>Fotos reais do cliente são recurso Premium.</Text>
                </TouchableOpacity>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ou escolha um Avatar Emoji</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiPicker}>
                  {['👤', '👨‍💼', '👩‍💼', '🧑‍🌾', '👵', '👴', '🦁', '🐱', '🐶', '🦊', '🐻', '🐼', '🐨', '🐸'].map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiItem, editPicture === emoji && styles.emojiItemActive]}
                      onPress={() => setEditPicture(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>

            <View style={styles.modalButtonsRow}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setIsEditProfileOpen(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Salvar"
                variant="primary"
                onPress={handleSaveProfile}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Ajustar Lançamento */}
      <Modal
        visible={!!selectedItem}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Ajustar Anotação</Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descrição</Text>
              <TextInput style={styles.formInput} value={itemDesc} onChangeText={setItemDesc} />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Valor Corrigido (R$)</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="decimal-pad"
                value={itemAmt}
                onChangeText={setItemAmt}
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setSelectedItem(null)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Confirmar"
                variant="accent"
                onPress={handleSaveItemEdit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  headerContainer: {
    backgroundColor: theme.colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadgeLocked: {
    backgroundColor: theme.colors.textMuted,
  },
  avatarEmoji: {
    fontSize: 16,
  },
  custName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  custPhone: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryBoxWrapper: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  summaryCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: theme.borderRadius.md,
    padding: 16,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#b45309',
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
  },
  stickyActions: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  gridActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  btnActionFiado: {
    flex: 1,
    backgroundColor: '#ffedd5',
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginRight: 6,
  },
  textActionFiado: {
    color: theme.colors.accent,
    fontSize: 11.5,
    fontWeight: '700',
  },
  btnActionPay: {
    flex: 1,
    backgroundColor: '#d1fae5',
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginRight: 6,
  },
  textActionPay: {
    color: theme.colors.primaryDark,
    fontSize: 11.5,
    fontWeight: '700',
  },
  btnActionNotice: {
    flex: 1,
    backgroundColor: '#e0f2fe',
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginRight: 6,
  },
  textActionNotice: {
    color: '#0369a1',
    fontSize: 11.5,
    fontWeight: '700',
  },
  timelineScroll: {
    padding: 20,
    paddingBottom: 60,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  timelineSub: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  timelineWrapper: {
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.border,
    paddingLeft: 16,
    marginLeft: 6,
  },
  emptyTimeline: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  timelineNode: {
    position: 'relative',
    marginBottom: 16,
  },
  dot: {
    position: 'absolute',
    left: -23,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  nodeBox: {
    backgroundColor: theme.colors.inputBg,
    padding: 12,
    borderRadius: theme.borderRadius.sm,
  },
  nodeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nodeType: {
    fontSize: 13,
    fontWeight: '700',
  },
  nodeAmount: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  nodeDesc: {
    fontSize: 14,
    color: theme.colors.textMain,
    marginBottom: 6,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 4,
  },
  nodeMetaText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  nodeBalText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primaryDark,
  },
  nodeEditRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  nodeBtn: {
    marginLeft: 12,
  },
  nodeBtnText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  nodeBtnTextRed: {
    fontSize: 11,
    color: theme.colors.dangerText,
  },
  deleteProfileWrapper: {
    marginTop: 30,
    alignItems: 'center',
    padding: 12,
  },
  deleteProfileText: {
    color: theme.colors.dangerText,
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalSheet: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 20,
    ...theme.shadows.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  custSubText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  custSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  btnActionPrint: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginTop: 10,
  },
  textActionPrint: {
    color: '#334155',
    fontSize: 11.5,
    fontWeight: '700',
  },
  profileDetailsWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  profileDetailsCard: {
    padding: 14,
    marginVertical: 0,
  },
  profileDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  profileDetailsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textMain,
  },
  profileDetailsSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  profileEditLink: {
    minHeight: 32,
    paddingHorizontal: 6,
  },
  profileEditLinkText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  profileDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailItem: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 130,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.sm,
    padding: 10,
  },
  detailItemFull: {
    flexBasis: '100%',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMain,
    lineHeight: 18,
  },
  radioGroup: {
    flexDirection: 'row',
    marginTop: 4,
  },
  radioButton: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginRight: 8,
  },
  radioActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  radioText: {
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  radioTextActive: {
    color: '#ffffff',
  },
  emojiPicker: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  emojiItem: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emojiItemActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  emojiText: {
    fontSize: 20,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
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
    opacity: 0.8,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
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
  photoHint: {
    marginTop: 8,
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  photoPremiumBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  photoPremiumText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accent,
  },
});
