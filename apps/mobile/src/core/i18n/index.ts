import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as ExpoLocalization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
};

const LANGUAGE_STORAGE_KEY = '@dailydue_language';

const getInitialLocale = async (): Promise<string> => {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'hi' || saved === 'ta') return saved;
    if (saved === 'en') return 'en';
  } catch {}
  try {
    const locales = ExpoLocalization.getLocales();
    if (locales && locales.length > 0) {
      const primary = locales[0].languageCode;
      if (primary === 'hi' || primary === 'ta') return primary;
    }
  } catch {}
  return 'en';
};

export const changeLanguage = async (lng: 'en' | 'hi' | 'ta'): Promise<void> => {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  await i18n.changeLanguage(lng);
};

export const getCurrentLanguage = (): string => i18n.language;

export const getDateLocale = (): string => {
  const lang = i18n.language || 'en';
  const map: Record<string, string> = {
    en: 'en-US',
    hi: 'hi-IN',
    ta: 'ta-IN',
  };
  return map[lang] || 'en-US';
};

// Initialize asynchronously
let initPromise: ReturnType<typeof i18n.init> | null = null;

export const initI18n = async () => {
  if (initPromise) return initPromise;
  const lng = await getInitialLocale();
  initPromise = i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });
  return initPromise;
};

// Initialize immediately for sync usage
void initI18n();

export default i18n;
