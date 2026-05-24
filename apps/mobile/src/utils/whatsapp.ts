import { Alert, Linking } from "react-native";

export function normalizeBrazilWhatsapp(raw?: string | null) {
  if (!raw) return null;

  let phone = raw.replace(/\D/g, "");

  if (!phone) return null;

  if (!phone.startsWith("55")) {
    phone = `55${phone}`;
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
