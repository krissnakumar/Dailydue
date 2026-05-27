import { Alert, Linking } from "react-native";

export function normalizeBrazilWhatsapp(raw?: string | null) {
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

  if (!phone.startsWith("55")) {
    phone = `55${phone}`;
  }

  // Keep only plausible BR WhatsApp sizes:
  // 55 + DDD + 8/9 digits => 12 or 13 total digits
  if (phone.length < 12) return null;
  if (phone.length > 13) {
    // If extra digits slipped in, keep the rightmost 13 (usually includes DDI+DDD+number)
    phone = phone.slice(-13);
  }

  return phone;
}

export async function openClientWhatsapp(
  whatsapp: string | null | undefined,
  message: string
) {
  const phone = normalizeBrazilWhatsapp(whatsapp);

  if (!phone) {
    Alert.alert("WhatsApp não cadastrado", "Este cliente não tem WhatsApp cadastrado.");
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
