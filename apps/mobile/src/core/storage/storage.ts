import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_SALT = 'faido_secure_cache_salt_2026';

function encrypt(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ STORAGE_SALT.charCodeAt(i % STORAGE_SALT.length);
    result += String.fromCharCode(charCode);
  }
  // Safe Base64 encoding
  try {
    return btoa(unescape(encodeURIComponent(result)));
  } catch {
    return btoa(result);
  }
}

function decrypt(cipherText: string): string {
  try {
    let text = '';
    try {
      text = decodeURIComponent(escape(atob(cipherText)));
    } catch {
      text = atob(cipherText);
    }
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ STORAGE_SALT.charCodeAt(i % STORAGE_SALT.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch {
    return '';
  }
}

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    return AsyncStorage.removeItem(key);
  },
  clear: async (): Promise<void> => {
    return AsyncStorage.clear();
  },

  // Encrypted Cache & Secure Token Storage Methods
  setSecureItem: async (key: string, value: string): Promise<void> => {
    const encrypted = encrypt(value);
    await AsyncStorage.setItem(`secure_${key}`, encrypted);
  },
  getSecureItem: async (key: string): Promise<string | null> => {
    const encrypted = await AsyncStorage.getItem(`secure_${key}`);
    if (!encrypted) return null;
    return decrypt(encrypted);
  },
  removeSecureItem: async (key: string): Promise<void> => {
    await AsyncStorage.removeItem(`secure_${key}`);
  }
};

export default storage;
