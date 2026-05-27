import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { EncryptedStorage } from '../security/encrypted-storage';

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    return EncryptedStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    return EncryptedStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    return EncryptedStorage.removeItem(key);
  },
  clear: async (): Promise<void> => {
    return AsyncStorage.clear();
  },

  setSecureItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      console.warn('[Storage] SecureStore unavailable — sensitive data will not be persisted.', e);
    }
  },
  getSecureItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.warn('[Storage] SecureStore unavailable for get.', e);
      return null;
    }
  },
  removeSecureItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.warn('[Storage] SecureStore unavailable for remove.', e);
    }
  },
};

export default storage;
