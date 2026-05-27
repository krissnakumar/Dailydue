let SecureStore: any = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  // Graceful fallback for mock storage in sandbox
}

const simulatedSecureVault: Record<string, string> = {};

function warnInsecureFallback(action: string, error: unknown) {
  console.warn(`[SecureStorageService] Secure storage unavailable during ${action}.`, error);
  if (!__DEV__) {
    console.error('[SecureStorageService] Refusing insecure fallback outside development.');
  }
}

export const SecureStorageService = {
  async setSecureItem(key: string, value: string): Promise<void> {
    try {
      if (!SecureStore || !SecureStore.setItemAsync) {
        if (__DEV__) {
          simulatedSecureVault[key] = value;
          return;
        }
        throw new Error('SecureStore unavailable');
      }
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch (error) {
      warnInsecureFallback('setSecureItem', error);
      if (__DEV__) {
        simulatedSecureVault[key] = value;
      } else {
        throw error;
      }
    }
  },

  async getSecureItem(key: string): Promise<string | null> {
    try {
      if (!SecureStore || !SecureStore.getItemAsync) {
        return __DEV__ ? simulatedSecureVault[key] || null : null;
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      warnInsecureFallback('getSecureItem', error);
      return __DEV__ ? simulatedSecureVault[key] || null : null;
    }
  },

  async deleteSecureItem(key: string): Promise<void> {
    try {
      if (!SecureStore || !SecureStore.deleteItemAsync) {
        if (__DEV__) {
          delete simulatedSecureVault[key];
        }
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      warnInsecureFallback('deleteSecureItem', error);
      if (__DEV__) {
        delete simulatedSecureVault[key];
      }
    }
  },

  async clearAllCredentials(): Promise<void> {
    await this.deleteSecureItem('fiado_app_lock_pin');
    await this.deleteSecureItem('fiado_is_biometrics_enabled');
    await this.deleteSecureItem('fiado_is_system_lock_enabled');
    await this.deleteSecureItem('fiado_auto_lock_timeout');
  },
};
