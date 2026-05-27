let SecureStore: any = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  // Graceful fallback for mock storage in sandbox — NEVER stores to AsyncStorage
}

const simulatedSecureVault: Record<string, string> = {};

export const SecureStorageService = {
  async setSecureItem(key: string, value: string): Promise<void> {
    try {
      if (!SecureStore || !SecureStore.setItemAsync) {
        console.warn('[SecureStorageService] SecureStore unavailable. Sensitive data will NOT be persisted across app restarts.');
        return;
      }
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch (error) {
      console.warn('[SecureStorageService] Failed to set secure item:', error);
      // Intentionally NOT falling back to AsyncStorage — even in dev.
      // Secure data must never be stored in plaintext.
      throw error;
    }
  },

  async getSecureItem(key: string): Promise<string | null> {
    try {
      if (!SecureStore || !SecureStore.getItemAsync) {
        return null;
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn('[SecureStorageService] Failed to get secure item:', error);
      return null;
    }
  },

  async deleteSecureItem(key: string): Promise<void> {
    try {
      if (!SecureStore || !SecureStore.deleteItemAsync) {
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn('[SecureStorageService] Failed to delete secure item:', error);
    }
  },

  async clearAllCredentials(): Promise<void> {
    await this.deleteSecureItem('dailydue_app_lock_pin');
    await this.deleteSecureItem('dailydue_is_biometrics_enabled');
    await this.deleteSecureItem('dailydue_is_system_lock_enabled');
    await this.deleteSecureItem('dailydue_auto_lock_timeout');
  },
};
