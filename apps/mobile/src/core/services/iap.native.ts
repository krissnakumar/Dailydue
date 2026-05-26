import { Platform } from 'react-native';
import Constants from 'expo-constants';

let useNativeIAP: any = null;
const isAndroid = Platform.OS === 'android';
const isExpoGo = Constants.appOwnership === 'expo';

if (isAndroid && !isExpoGo) {
  try {
    // Dynamic import to prevent compiler/bundler failures on web/iOS
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    useNativeIAP = require('react-native-iap')?.useIAP;
  } catch (err) {
    console.warn('[IAP] Failed to load native react-native-iap module:', err);
  }
}

export function useIAP(callbacks?: {
  onPurchaseSuccess?: (purchase: any) => void | Promise<void>;
  onPurchaseError?: (error: any) => void;
}) {
  if (!useNativeIAP) {
    return {
      connected: false,
      subscriptions: [],
      fetchProducts: async () => {},
      requestPurchase: async () => {
        throw new Error('NATIVE_IAP_MODULE_NOT_LOADED');
      },
      finishTransaction: async () => {},
      restorePurchases: async () => {},
      getAvailablePurchases: async () => [],
    };
  }

  // Delegate safely to native hook
  return useNativeIAP(callbacks);
}
