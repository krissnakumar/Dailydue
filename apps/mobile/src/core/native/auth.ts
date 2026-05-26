import { Platform } from 'react-native';
import Constants from 'expo-constants';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

let googleSigninModule: any = null;
let hasNativeModule: boolean | null = null;
let configured = false;

function checkNativeModuleAvailable(): boolean {
  if (hasNativeModule !== null) return hasNativeModule;
  if (Platform.OS !== 'android') {
    hasNativeModule = false;
    return false;
  }
  if (Constants.appOwnership === 'expo') {
    hasNativeModule = false;
    return false;
  }
  try {
    googleSigninModule = require('@react-native-google-signin/google-signin');
    hasNativeModule = true;
  } catch (e) {
    hasNativeModule = false;
  }
  return hasNativeModule;
}

export const nativeAuth = {
  isGoogleNativeEnabled: () => {
    return Boolean(webClientId) && checkNativeModuleAvailable();
  },
  configureGoogleNativeIfNeeded: () => {
    if (configured) return;
    if (!nativeAuth.isGoogleNativeEnabled()) return;

    try {
      const { GoogleSignin } = googleSigninModule || require('@react-native-google-signin/google-signin');
      GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
        forceCodeForRefreshToken: false,
      });
      configured = true;
    } catch (err) {
      console.warn('[Native Auth] Failed to configure Google Sign-In:', err);
    }
  },
  getGoogleIdToken: async (): Promise<{ idToken: string } | null> => {
    if (!nativeAuth.isGoogleNativeEnabled()) return null;
    nativeAuth.configureGoogleNativeIfNeeded();

    try {
      const { GoogleSignin } = googleSigninModule || require('@react-native-google-signin/google-signin');
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      const idToken = res?.data?.idToken;
      if (!idToken) return null;
      return { idToken };
    } catch (e: any) {
      try {
        const { statusCodes } = googleSigninModule || require('@react-native-google-signin/google-signin');
        const code = e?.code;
        if (code === statusCodes.SIGN_IN_CANCELLED) return null;
        if (code === statusCodes.IN_PROGRESS) return null;
        if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return null;
      } catch (err) {
        console.warn('[Native Auth] Failed to read statusCodes:', err);
      }
      throw e;
    }
  }
};

if (nativeAuth.isGoogleNativeEnabled()) {
  nativeAuth.configureGoogleNativeIfNeeded();
}

export default nativeAuth;
