import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { openClientWhatsapp } from './whatsapp';

import i18n from '../core/i18n';

const LOCALE_MAP: Record<string, { locale: string; currency: string }> = {
  en: { locale: 'en-US', currency: 'USD' },
  hi: { locale: 'hi-IN', currency: 'INR' },
  ta: { locale: 'ta-IN', currency: 'INR' },
};

export function formatCurrency(amount: number): string {
  const lang = i18n.language || 'en';
  const config = LOCALE_MAP[lang] || { locale: 'en-IN', currency: 'INR' };
  return Number(amount || 0).toLocaleString(config.locale, {
    style: 'currency',
    currency: config.currency,
  });
}

export function sanitizePhone(phone: string): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

export interface SendReminderParams {
  customerName: string;
  totalDebt: number;
  lastItems: Array<{ description: string; amount: number }>;
  phone?: string;
  pixKey?: string;
  messageType?: 'simple' | 'detailed' | 'default';
  businessName?: string;
  dueDate?: string;
}

export async function sendWhatsappReminder({
  customerName,
  totalDebt,
  lastItems,
  phone,
  pixKey = 'shop@upi',
  messageType = 'default',
  businessName,
  dueDate,
}: SendReminderParams) {
  const firstName = customerName.split(' ')[0];
  let msg = '';

  if (messageType === 'simple') {
    msg = i18n.t('whatsapp.simpleTemplate', {
      name: firstName,
      value: formatCurrency(totalDebt),
      pixKey,
    });
  } else if (messageType === 'detailed') {
    let itemsText = '';
    lastItems.slice(0, 5).forEach((item) => {
      itemsText += `\n▫️ ${item.description} - ${formatCurrency(item.amount)}`;
    });
    msg = i18n.t('whatsapp.detailedTemplate', {
      name: firstName,
      value: formatCurrency(totalDebt),
      items: itemsText,
      pixKey,
    });
  } else {
    const formattedAmount = Number(totalDebt || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const bName = businessName || 'our store';
    const dueDateStr = dueDate ? `, due on ${dueDate}` : '';
    msg = i18n.t('whatsapp.defaultTemplate', {
      customerName,
      businessName: bName,
      amount: formattedAmount,
      dueDate: dueDateStr,
    });
  }

  await openClientWhatsapp(phone, msg);
}

export async function sendWhatsappReceipt(
  customerName: string,
  amountPaid: number,
  method: string,
  totalDebt: number,
  phone?: string
) {
  const firstName = customerName.split(' ')[0];
  const msg = i18n.t('whatsapp.receiptTemplate', {
    name: firstName,
    amount: formatCurrency(amountPaid),
    method,
    previousBalance: formatCurrency(totalDebt + amountPaid),
    remainingBalance: formatCurrency(totalDebt),
  });

  await openClientWhatsapp(phone, msg);
}

export async function generateStatementPDF(
  customerName: string,
  totalDebt: number,
  history: Array<{ description: string; amount: number; created_at: string; type: string }>,
  address?: string,
  cep?: string,
  documentType?: string,
  documentValue?: string,
  phone?: string,
  businessName?: string,
  pixKey?: string
) {
  const cleanPhone = phone?.trim() || '';
  const cleanDoc = documentValue ? documentValue.replace(/\D/g, '') : '';
  const formattedDoc = cleanDoc ? (
    cleanDoc.length === 11 
      ? cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") 
      : cleanDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  ) : '';
  const docLabel = documentType?.trim() ? documentType.trim().toUpperCase() : 'DOCUMENTO';
  const cleanAddress = address?.trim() || '';
  const cleanCep = cep?.trim() ? cep.replace(/\D/g, '') : '';

  const rows = history
    .map(
      (h) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${new Date(h.created_at).toLocaleDateString('en-US')}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px;"><b>${h.type === 'debt' ? '➕ Entry' : h.type === 'payment' ? '✔️ Payment' : '⚠️ System'}</b><br><span style="color: #64748b; font-size: 12px;">${h.description}</span></td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: ${h.type === 'debt' ? '#ea580c' : '#059669'}; font-weight: bold; font-size: 14px;">${formatCurrency(h.amount)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #0f172a; }
          .header { text-align: center; border-bottom: 2px solid #059669; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 24px; color: #064e3b; margin: 0; }
          .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
          .summary { background-color: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 24px; font-size: 18px; line-height: 1.6; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { text-align: left; padding: 10px; background-color: #f1f5f9; color: #475569; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">${businessName || 'Credit Ledger Statement'}</h1>
          <div class="subtitle">Digital Ledger Control</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
            Generated on ${new Date().toLocaleString('en-US')}
          </div>
        </div>
        <div class="summary">
          <div style="margin-bottom: 8px;">Client: <b style="font-size: 20px;">${customerName}</b></div>
          ${cleanPhone ? `<div style="font-size: 14px; color: #475569; margin-bottom: 4px;">📞 WhatsApp: <b>(${cleanPhone.substring(0, 2)}) ${cleanPhone.substring(2)}</b></div>` : ''}
          ${formattedDoc ? `<div style="font-size: 14px; color: #475569; margin-bottom: 4px;">🪪 ${docLabel}: <b>${formattedDoc}</b></div>` : ''}
          ${cleanAddress ? `<div style="font-size: 14px; color: #475569; margin-bottom: 4px;">📍 Address: <b>${cleanAddress}${cleanCep ? ` - ZIP: ${cleanCep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : ''}</b></div>` : ''}
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
            Current Debt Balance: <b style="color: #ea580c; font-size: 22px;">${formatCurrency(totalDebt)}</b>
          </div>
        </div>
        <h3>Transactions History</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Movement</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="3" style="text-align:center; padding: 20px; color: #64748b;">No transactions</td></tr>'}
          </tbody>
        </table>
        ${pixKey ? `
        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 12px; margin-top: 30px; font-size: 14px; line-height: 1.5; color: #064e3b;">
          💸 <b>Payment via UPI</b><br>
          You can pay the outstanding balance using the store's UPI key:<br>
          UPI Key: <b style="font-size: 16px; background-color: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #d1fae5;">${pixKey}</b>
        </div>
        ` : ''}
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}
export * from './responsive';
export * from './whatsapp';
