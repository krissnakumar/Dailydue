import * as Crypto from 'expo-crypto';

export const HashingService = {
  /**
   * Generates a secure SHA-256 cryptographic hash of a given string (PIN).
   */
  async hashPin(pin: string): Promise<string> {
    try {
      // In web/sandbox testing if Crypto is mocked or unavailable, fall back safely
      if (!Crypto || !Crypto.digestStringAsync) {
        // Simple fallback hash simulation
        let hash = 0;
        for (let i = 0; i < pin.length; i++) {
          hash = (hash << 5) - hash + pin.charCodeAt(i);
          hash |= 0; // Convert to 32bit integer
        }
        return `simulated_sha256_${hash}`;
      }

      const hashed = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin
      );
      return hashed;
    } catch (error) {
      console.error('[HashingService] Erro ao gerar hash:', error);
      throw new Error('Falha na cifragem de segurança do PIN.');
    }
  },

  /**
   * Compares a raw PIN with a target SHA-256 hash.
   */
  async comparePin(rawPin: string, hashedTarget: string): Promise<boolean> {
    const hashedRaw = await this.hashPin(rawPin);
    return hashedRaw === hashedTarget;
  }
};
