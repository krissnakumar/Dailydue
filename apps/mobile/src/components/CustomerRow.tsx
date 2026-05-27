import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Image, Alert, AlertButton } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { CustomerClient, useDailyDueStore, HistoryItem, isTempCustomerId } from '../store';
import { formatCurrency, sendWhatsappReminder } from '../utils';
import { theme } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

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

export interface CustomerRowProps {
  customer: CustomerClient;
  onPress: () => void;
  onSwipeLeft: () => void; // Payment
  onSwipeRight: () => void; // Add Debt
  pixKey?: string;
  selected?: boolean;
}

export const CustomerRow: React.FC<CustomerRowProps> = ({
  customer,
  onPress,
  onSwipeLeft,
  onSwipeRight,
  pixKey,
  selected,
}) => {
  const { t } = useTranslation();
  const swipeableRef = useRef<Swipeable>(null);
  const { deleteCustomer, deleteHistoryItem, businessConfig, syncQueue } = useDailyDueStore();
  const isZero = customer.total_debt === 0;
  
  const hasPendingSync = isTempCustomerId(customer.id) || syncQueue.some(
    q => String(q.payload?.customer_id || q.payload?.customerId || q.payload?.client_id || q.payload?.clientId || q.payload?.id || '') === customer.id
  );

  // Verifica atraso crítico (> overdueDays)
  const overdueDays = businessConfig.overdueDays || 15;
  const isAtrasado = customer.history.some(
    (h: HistoryItem) => h.type === 'debt' && (Date.now() - new Date(h.created_at).getTime()) / 86400000 > overdueDays
  );

  const lastItem = customer.history.length > 0 ? customer.history[0].description : t('clients.noClients');

  const handleWhatsappPress = () => {
    sendWhatsappReminder({
      customerName: customer.full_name,
      totalDebt: customer.total_debt,
      lastItems: customer.history.map((h: HistoryItem) => ({ description: h.description, amount: h.amount })),
      phone: customer.phone,
      pixKey,
      businessName: businessConfig.businessName,
    });
  };

  const handleMorePress = () => {
    const lastTx = customer.history.find(
      (h: HistoryItem) => h.type === 'debt' || h.type === 'payment'
    );

    const options: AlertButton[] = [
      {
        text: t('customerDetail.delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            t('customerDetail.delete'),
            t('customerRow.deleteConfirmDesc', { name: customer.full_name }),
            [
              { text: t('customerRow.cancel'), style: 'cancel' },
              {
                text: t('customerRow.yesDelete'),
                style: 'destructive',
                onPress: () => {
                  deleteCustomer(customer.id);
                },
              },
            ]
          );
        },
      },
    ];

    if (lastTx) {
      options.unshift({
        text: t('customerDetail.edit'),
        style: 'default',
        onPress: () => {
          Alert.alert(
            t('common.confirm'),
            t('customerRow.removeConfirmDesc', { description: lastTx.description, value: formatCurrency(lastTx.amount) }),
            [
              { text: t('common.no'), style: 'cancel' },
              {
                text: t('common.yes'),
                style: 'destructive',
                onPress: () => {
                  deleteHistoryItem(customer.id, lastTx.id);
                },
              },
            ]
          );
        },
      });
    }

    options.push({
      text: t('common.cancel'),
      style: 'cancel',
      onPress: () => {},
    });

    Alert.alert(t('common.options'), customer.full_name, options);
  };

  const renderLeftActions = (progress: any, dragX: any) => {
    const scale = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.leftAction}
        onPress={() => {
          swipeableRef.current?.close();
          onSwipeRight();
        }}
        activeOpacity={0.8}
      >            <Animated.Text style={[styles.actionText, { transform: [{ scale }] }]}>
          {t('newFiado.title')}
        </Animated.Text>
      </TouchableOpacity>
    );
  };

  const renderRightActions = (progress: any, dragX: any) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.rightAction}
        onPress={() => {
          swipeableRef.current?.close();
          onSwipeLeft();
        }}
        activeOpacity={0.8}
      >            <Animated.Text style={[styles.actionText, { transform: [{ scale }] }]}>
          {t('payments.title')}
        </Animated.Text>
      </TouchableOpacity>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      friction={2}
    >
      <View style={[styles.cardContainer, selected && styles.cardSelected]}>
        <TouchableOpacity style={styles.mainArea} onPress={onPress} activeOpacity={0.7}>
          <View style={styles.leftInfo}>
            <View
              style={[
                styles.statusAvatar,
                { backgroundColor: isZero ? '#d1fae5' : isAtrasado ? '#fee2e2' : '#fef9c3' },
              ]}
            >
              {customer.picture ? (
                isEmoji(customer.picture) ? (
                  <Text style={styles.avatarEmoji}>{customer.picture}</Text>
                ) : (
                  <Image source={{ uri: customer.picture }} style={styles.avatarImage} />
                )
              ) : (
                <Ionicons
                  name="person"
                  size={16}
                  color={isZero ? '#065f46' : isAtrasado ? '#991b1b' : '#854d0e'}
                />
              )}
            </View>

            <View style={styles.textColumn}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text style={styles.nameText} numberOfLines={1}>
                  {customer.full_name}
                </Text>
                {hasPendingSync && (
                  <View style={styles.pendingBadge}>
                    <Ionicons name="cloud-upload" size={11} color="#3b82f6" style={{ marginRight: 2 }} />
                    <Text style={styles.pendingBadgeText}>{t('common.pending')}</Text>
                  </View>
                )}
              </View>
              {(customer.phone || customer.documentValue) ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                  {customer.phone ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="call-outline" size={10} color={theme.colors.textMuted} />
                      <Text style={styles.metadataText}>{customer.phone}</Text>
                    </View>
                  ) : null}
                  {customer.documentValue ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="card-outline" size={10} color={theme.colors.textMuted} />
                      <Text style={styles.metadataText}>
                        {customer.documentType?.toUpperCase()}: {customer.documentValue}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {customer.address ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  <Ionicons name="pin-outline" size={10} color={theme.colors.textMuted} />
                  <Text style={styles.metadataText} numberOfLines={1}>
                    {customer.address}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Ionicons name="time-outline" size={11} color={theme.colors.textMuted} />
                <Text style={[styles.lastItemText, { marginTop: 0 }]} numberOfLines={1}>
                  {lastItem}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.debtColumn}>
            <Text style={[styles.debtAmount, isZero && styles.debtZero]}>
              {formatCurrency(customer.total_debt)}
            </Text>
            <View
              style={[
                styles.badge,
                { backgroundColor: isZero ? '#d1fae5' : isAtrasado ? '#fee2e2' : '#ffedd5' },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: isZero ? '#065f46' : isAtrasado ? '#991b1b' : '#c2410c' },
                ]}
              >
                {isZero ? t('customerDetail.paid') : isAtrasado ? t('customerDetail.overdue') : t('customerDetail.pending')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Botoes de Ação Direta no Card mantendo o spacing rhythm e hierarchy original */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnCardAdd} onPress={onSwipeRight} activeOpacity={0.7}>
            <Ionicons name="add" size={14} color={theme.colors.accent} />
            <Text style={styles.btnTextAdd}>{t('newFiado.title')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnCardReceive} onPress={onSwipeLeft} activeOpacity={0.7}>
            <Ionicons name="checkmark" size={14} color={theme.colors.primaryDark} />
            <Text style={styles.btnTextReceive}>{t('payments.title')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnWhatsapp} onPress={handleWhatsappPress} activeOpacity={0.7}>
            <Ionicons name="logo-whatsapp" size={16} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnMore} onPress={handleMorePress} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  cardSelected: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: '#f0fdf4',
  },
  mainArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  statusAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarEmoji: {
    fontSize: 16,
  },
  textColumn: {
    flex: 1,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textMain,
    marginBottom: 2,
  },
  lastItemText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  debtColumn: {
    alignItems: 'flex-end',
  },
  debtAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.accent,
    fontFamily: 'Outfit',
  },
  debtZero: {
    color: theme.colors.primary,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBg,
    padding: 8,
    alignItems: 'center',
  },
  btnCardAdd: {
    flex: 1,
    backgroundColor: '#ffedd5',
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginRight: 6,
  },
  btnTextAdd: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  btnCardReceive: {
    flex: 1,
    backgroundColor: '#d1fae5',
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginRight: 6,
  },
  btnTextReceive: {
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  btnWhatsapp: {
    backgroundColor: theme.colors.whatsapp,
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnMore: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  whatsappIcon: {
    fontSize: 16,
    color: '#ffffff',
  },
  leftAction: {
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    flex: 1,
    marginVertical: 6,
    borderRadius: theme.borderRadius.md,
  },
  rightAction: {
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    flex: 1,
    marginVertical: 6,
    borderRadius: theme.borderRadius.md,
  },
  actionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  metadataText: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  pendingBadgeText: {
    fontSize: 9,
    color: '#1d4ed8',
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
});
