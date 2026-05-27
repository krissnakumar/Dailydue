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

  async authenticateAsync(promptMessage = 'Confirme sua identidade para acessar o Fiado.'): Promise<{ success: boolean; error?: string }> {
    try {
      const hasHardware = await this.hasHardwareAsync();
      if (!hasHardware) {
        return { success: false, error: 'Hardware de biometria/segurança não disponível neste dispositivo.' };
      }

      const isEnrolled = await this.isEnrolledAsync();
      if (!isEnrolled) {
        return { success: false, error: 'Nenhuma credencial de segurança (PIN, padrão ou biometria) cadastrada no aparelho.' };
      }

      // LocalAuthentication will fallback to device PIN/Pattern/Password if biometrics fail or is selected
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false, // Ensure system PIN/pattern fallback is active!
        fallbackLabel: 'Usar Senha do Aparelho',
      });

      if (result.success) {
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Autenticação falhou' };
      }
    } catch (e) {
      console.error('[SecurityService] Authentication exception:', e);
      return { success: false, error: String(e) };
    }
  }
};
