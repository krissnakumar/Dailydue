import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

function warnInsecureFallback(action: string, error: unknown) {
  console.warn(`[Storage] Secure storage unavailable during ${action}.`, error);
  if (!__DEV__) {
    console.error('[Storage] Refusing to store sensitive data in AsyncStorage outside development.');
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

  setSecureItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      warnInsecureFallback('setSecureItem', e);
      if (__DEV__) {
        await AsyncStorage.setItem(`secure_${key}`, value);
      } else {
        throw e;
      }
    }
  },
  getSecureItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      warnInsecureFallback('getSecureItem', e);
      if (__DEV__) {
        return AsyncStorage.getItem(`secure_${key}`);
      }
      return null;
    }
  },
  removeSecureItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      warnInsecureFallback('removeSecureItem', e);
      if (__DEV__) {
        await AsyncStorage.removeItem(`secure_${key}`);
      }
    }
  },
};

export default storage;
