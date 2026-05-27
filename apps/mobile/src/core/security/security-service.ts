import * as LocalAuthentication from 'expo-local-authentication';

export const SecurityService = {
  async hasHardwareAsync(): Promise<boolean> {
    try {
      return await LocalAuthentication.hasHardwareAsync();
    } catch (e) {
      console.warn('[SecurityService] Error checking hardware:', e);
      return false;
    }
  },

  async isEnrolledAsync(): Promise<boolean> {
    try {
      return await LocalAuthentication.isEnrolledAsync();
    } catch (e) {
      console.warn('[SecurityService] Error checking enrolled security:', e);
      return false;
    }
  },

  async isSecuritySupportedAsync(): Promise<boolean> {
    const hasHardware = await this.hasHardwareAsync();
    const isEnrolled = await this.isEnrolledAsync();
    return hasHardware && isEnrolled;
  },

  async authenticateAsync(promptMessage = 'Confirm your identity to access DailyDue.'): Promise<{ success: boolean; error?: string }> {
    try {
      const hasHardware = await this.hasHardwareAsync();
      if (!hasHardware) {
        return { success: false, error: 'Biometrics/security hardware not available on this device.' };
      }

      const isEnrolled = await this.isEnrolledAsync();
      if (!isEnrolled) {
        return { success: false, error: 'No security credentials (PIN, pattern, or biometrics) registered on the device.' };
      }

      // LocalAuthentication will fallback to device PIN/Pattern/Password if biometrics fail or is selected
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Ensure system PIN/pattern fallback is active!
        fallbackLabel: 'Use Device Password',
      });

      if (result.success) {
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Authentication failed' };
      }
    } catch (e) {
      console.error('[SecurityService] Authentication exception:', e);
      return { success: false, error: String(e) };
    }
  }
};
