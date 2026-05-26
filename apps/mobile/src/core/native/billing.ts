import { Platform } from 'react-native';
import Constants from 'expo-constants';

let iapModule: any = null;
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  try {
    iapModule = require('react-native-iap');
  } catch (err) {
    console.warn('[Native Billing] Failed to load native react-native-iap module:', err);
  }
}

export const nativeBilling = {
  isAvailable: () => !!iapModule,
  getIAPHook: () => iapModule?.useIAP || null,
  requestPurchase: async (options: any) => {
    if (!iapModule) {
      console.warn('[Native Billing] Purchase requested but native IAP module is unavailable.');
      throw new Error('NATIVE_BILLING_UNAVAILABLE');
    }
    return iapModule.requestPurchase(options);
  },
  getAvailablePurchases: async (options: any) => {
    if (!iapModule) return [];
    return iapModule.getAvailablePurchases(options);
  },
  restorePurchases: async (options: any) => {
    if (!iapModule) return [];
    return iapModule.restorePurchases(options);
  }
};
export default nativeBilling;
