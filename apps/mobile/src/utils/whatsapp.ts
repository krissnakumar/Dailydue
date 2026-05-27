import { Alert, Linking } from "react-native";
import i18n from '../core/i18n';

export function normalizeIndiaWhatsapp(raw?: string | null) {
  if (!raw) return null;

  let phone = raw.replace(/\D/g, "");

  if (!phone) return null;

  // Convert international prefix 00xx... to xx...
  if (phone.startsWith("00")) {
    phone = phone.slice(2);
  }

  // Remove local trunk zero when present (e.g., 0DDDN...)
  if (phone.startsWith("0")) {
    phone = phone.slice(1);
  }

  if (!phone.startsWith("91")) {
    phone = `91${phone}`;
  }

  // Keep only plausible IN WhatsApp sizes:
  // 91 + 10 digits => 12 total digits
  if (phone.length < 10) return null;
  if (phone.length > 12) {
    phone = phone.slice(-12);
  }

  return phone;
}

export async function openClientWhatsapp(
  whatsapp: string | null | undefined,
  message: string
) {
  const phone = normalizeIndiaWhatsapp(whatsapp);

  if (!phone) {
    Alert.alert(i18n.t('whatsapp.noWhatsApp'), i18n.t('whatsapp.noWhatsAppDesc'));
    return;
  }

  const encodedMessage = encodeURIComponent(message);
  const appUrl = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
  const webUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

  try {
    const supported = await Linking.canOpenURL(appUrl);

    if (supported) {
      await Linking.openURL(appUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch (error) {
    await Linking.openURL(webUrl);
  }
}
