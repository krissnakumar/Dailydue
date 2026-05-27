import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

const KEY_ALIAS = 'dailydue_local_data_encryption_key_v1';
const ENCRYPTED_PREFIX = 'enc:v2:';
const LEGACY_ENCRYPTED_PREFIX = 'enc:v1:';
const PLAINTEXT_PREFIX = 'plain:v0:';

let hasWarnedInsecureFallback = false;

type KeyMode = 'secure' | 'insecure';

function warnInsecureFallbackOnce() {
  if (hasWarnedInsecureFallback) return;
  hasWarnedInsecureFallback = true;
  console.warn('[EncryptedStorage] SecureStore unavailable. Falling back to plaintext persistence for compatibility.');
}

async function getOrCreateEncryptionKey(): Promise<{ key: string | null; mode: KeyMode }> {
  try {
    let key = await SecureStore.getItemAsync(KEY_ALIAS);
    if (key) return { key, mode: 'secure' };

    const seed = `${Crypto.randomUUID?.() || ''}:${Date.now()}:${Math.random()}`;
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, seed);
    key = digest;
    await SecureStore.setItemAsync(KEY_ALIAS, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return { key, mode: 'secure' };
  } catch {
    warnInsecureFallbackOnce();
    return { key: null, mode: 'insecure' };
  }
}

function encryptionKeyFromMaster(masterKey: string) {
  return CryptoJS.SHA256(`${masterKey}:enc`).toString();
}

function macKeyFromMaster(masterKey: string) {
  return CryptoJS.SHA256(`${masterKey}:mac`).toString();
}

function encryptTextV2(plain: string, masterKey: string) {
  const encKey = encryptionKeyFromMaster(masterKey);
  const macKey = macKeyFromMaster(masterKey);
  const ct = CryptoJS.AES.encrypt(plain, encKey).toString();
  const mac = CryptoJS.HmacSHA256(ct, macKey).toString();
  const payload = JSON.stringify({ ct, mac });
  return `${ENCRYPTED_PREFIX}${payload}`;
}

function decryptTextV2(payloadText: string, masterKey: string) {
  const payload = JSON.parse(payloadText) as { ct?: string; mac?: string };
  if (!payload?.ct || !payload?.mac) throw new Error('ENCRYPTED_PAYLOAD_INVALID');

  const macKey = macKeyFromMaster(masterKey);
  const expectedMac = CryptoJS.HmacSHA256(payload.ct, macKey).toString();
  if (expectedMac !== payload.mac) throw new Error('ENCRYPTED_PAYLOAD_TAMPERED_OR_KEY_MISMATCH');

  const encKey = encryptionKeyFromMaster(masterKey);
  const bytes = CryptoJS.AES.decrypt(payload.ct, encKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}

function decryptLegacyV1(cipherWithMaybePrefix: string, masterKey: string) {
  const cipher = cipherWithMaybePrefix.startsWith(LEGACY_ENCRYPTED_PREFIX)
    ? cipherWithMaybePrefix.slice(LEGACY_ENCRYPTED_PREFIX.length)
    : cipherWithMaybePrefix;
  const bytes = CryptoJS.AES.decrypt(cipher, masterKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}

async function maybeMigratePlaintext(key: string, value: string, masterKey: string | null, mode: KeyMode) {
  if (!value) return value;
  if (value.startsWith(ENCRYPTED_PREFIX) || value.startsWith(LEGACY_ENCRYPTED_PREFIX) || value.startsWith(PLAINTEXT_PREFIX)) {
    return value;
  }
  if (mode !== 'secure' || !masterKey) {
    const tagged = `${PLAINTEXT_PREFIX}${value}`;
    await AsyncStorage.setItem(key, tagged);
    return tagged;
  }
  const encrypted = encryptTextV2(value, masterKey);
  await AsyncStorage.setItem(key, encrypted);
  return encrypted;
}

export const EncryptedStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const keyState = await getOrCreateEncryptionKey();
      const migrated = await maybeMigratePlaintext(key, raw, keyState.key, keyState.mode);
      if (!migrated) return null;

      if (migrated.startsWith(PLAINTEXT_PREFIX)) {
        return migrated.slice(PLAINTEXT_PREFIX.length);
      }

      if (keyState.mode !== 'secure' || !keyState.key) return null;

      if (migrated.startsWith(ENCRYPTED_PREFIX)) {
        const payload = migrated.slice(ENCRYPTED_PREFIX.length);
        const decrypted = decryptTextV2(payload, keyState.key);
        if (decrypted === '' && payload.length > 0) throw new Error('ENCRYPTED_PAYLOAD_DECRYPT_EMPTY');
        return decrypted;
      }

      const legacyDecrypted = decryptLegacyV1(migrated, keyState.key);
      if (legacyDecrypted === '' && migrated.length > LEGACY_ENCRYPTED_PREFIX.length) {
        throw new Error('LEGACY_ENCRYPTED_PAYLOAD_DECRYPT_EMPTY');
      }
      const upgraded = encryptTextV2(legacyDecrypted, keyState.key);
      await AsyncStorage.setItem(key, upgraded);
      return legacyDecrypted;
    } catch (error) {
      console.warn('[EncryptedStorage] getItem failed:', error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      const keyState = await getOrCreateEncryptionKey();
      if (keyState.mode !== 'secure' || !keyState.key) {
        warnInsecureFallbackOnce();
        await AsyncStorage.setItem(key, `${PLAINTEXT_PREFIX}${value}`);
        return;
      }
      const encrypted = encryptTextV2(value, keyState.key);
      await AsyncStorage.setItem(key, encrypted);
    } catch (error) {
      console.warn('[EncryptedStorage] setItem failed:', error);
    }
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
