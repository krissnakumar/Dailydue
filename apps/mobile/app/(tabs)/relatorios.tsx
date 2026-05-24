import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Header, Card, Button } from '../../src/components';
import { useFiadoStore } from '../../src/store';
import { formatCurrency, generateStatementPDF } from '../../src/utils';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AdaptiveGrid } from '../../src/components';
import { useResponsive } from '../../src/utils/responsive';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

export default function RelatoriosScreen() {
  const router = useRouter();
  const { customers } = useFiadoStore();
  const layout = useResponsive();

  let totalDebts = 0;
  let totalPayments = 0;
  let totalDevendo = 0;

  const historyFlat: Array<{
    customerId: string;
    customerName: string;
    description: string;
    amount: number;
    created_at: string;
    type: string;
  }> = [];

  customers.forEach((c) => {
    if (c.total_debt > 0) {
      totalDevendo += c.total_debt;
    }

    c.history.forEach((h) => {
      if (h.type === 'debt') totalDebts += h.amount;
      if (h.type === 'payment') totalPayments += h.amount;

      historyFlat.push({
        customerId: c.id,
        customerName: c.full_name,
        description: h.description,
        amount: h.amount,
        created_at: h.created_at,
        type: h.type,
      });
    });
  });

  historyFlat.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleExportPDF = () => {
    generateStatementPDF('Balanço Geral da Loja', totalDevendo, historyFlat);
  };

  const handleExportExcel = async () => {
    try {
      const header = 'Data;Cliente;Descricao;Tipo;Valor\n';
      const rows = historyFlat.map(item => {
        const dt = new Date(item.created_at).toLocaleDateString('pt-BR');
        const typeStr = item.type === 'debt' ? 'Fiado' : 'Pagamento';
        return `${dt};${item.customerName};${item.description};${typeStr};${item.amount}`;
      }).join('\n');

      const csvContent = header + rows;
      const fileName = `Relatorio_Fiado_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = FileSystem.cacheDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Relatório',
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert('Erro', 'O compartilhamento não está disponível neste dispositivo.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Falha ao gerar o arquivo CSV.');
    }
  };

  return (
    <View style={styles.wrapper}>
      <Header
        showTotal={false}
        title="Relatórios Financeiros"
        leftAction={
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 12, paddingVertical: 4, paddingRight: 4 }}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            width: '100%',
            paddingHorizontal: layout.spacing.screen,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(0)}>
          <Text style={styles.sectionTitle}>Métricas Globais Acumuladas</Text>

          <Card style={styles.cardBox}>
            <View style={styles.rowItem}>
              <Text style={styles.rowLabel}>Total Lançado (Fiados):</Text>
              <Text style={styles.rowValDebt}>{formatCurrency(totalDebts)}</Text>
            </View>

            <View style={styles.rowItem}>
              <Text style={styles.rowLabel}>Total Recebido (Baixas):</Text>
              <Text style={styles.rowValPay}>{formatCurrency(totalPayments)}</Text>
            </View>

            <View style={[styles.rowItem, styles.rowLast]}>
              <Text style={styles.rowLabelBold}>Saldo em Aberto na Praça:</Text>
              <Text style={styles.rowValNet}>{formatCurrency(totalDevendo)}</Text>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(0).duration(0)}>
          <Text style={styles.sectionTitle}>Opções de Exportação</Text>
          <AdaptiveGrid minItemWidth={240} maxColumns={2} style={styles.exportGrid}>
            <Button
              title="Exportar Extrato (PDF)"
              leftIcon={<Ionicons name="document-text-outline" size={16} color={theme.colors.textMain} style={{ marginRight: 6 }} />}
              variant="secondary"
              style={styles.exportBtn}
              onPress={handleExportPDF}
            />
            <Button
              title="Planilha de Dados (CSV)"
              leftIcon={<Ionicons name="bar-chart-outline" size={16} color={theme.colors.textMain} style={{ marginRight: 6 }} />}
              variant="secondary"
              style={styles.exportBtn}
              onPress={handleExportExcel}
            />
          </AdaptiveGrid>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(0).duration(0)}>
          <Text style={styles.sectionTitle}>Registro Geral de Auditoria ({historyFlat.length})</Text>

          <Card style={styles.tableCard}>
            {historyFlat.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum registro encontrado.</Text>
            ) : (
              historyFlat.map((item, idx) => {
                const dt = new Date(item.created_at).toLocaleDateString('pt-BR');
                const isDebt = item.type === 'debt';
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => router.push(`/clientes/${item.customerId}`)}
                    activeOpacity={0.7}
                  >
                    <Animated.View
                      entering={idx < 25 ? FadeInRight.delay(0).duration(0) : undefined}
                      style={[styles.tableRow, idx === historyFlat.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemCust}>{item.customerName}</Text>
                        <Text style={styles.itemDesc}>{item.description}</Text>
                        <Text style={styles.itemDate}>{dt}</Text>
                      </View>

                      <Text style={[styles.itemAmt, { color: isDebt ? theme.colors.accent : theme.colors.primary }]}>
                        {isDebt ? '+' : '-'} {formatCurrency(item.amount)}
                      </Text>
                    </Animated.View>
                  </TouchableOpacity>
                );
              })
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  cardBox: {
    padding: 16,
  },
  rowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    marginTop: 4,
  },
  rowLabel: {
    fontSize: 14,
    color: theme.colors.textMain,
  },
  rowLabelBold: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  rowValDebt: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  rowValPay: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  rowValNet: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primaryBrand,
    fontFamily: 'Outfit',
  },
  exportGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  exportBtn: {
    width: '100%',
    backgroundColor: theme.colors.card,
  },
  tableCard: {
    padding: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    paddingVertical: 20,
    fontSize: 13,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBg,
  },
  itemCust: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMain,
  },
  itemDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  itemDate: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  itemAmt: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
});
