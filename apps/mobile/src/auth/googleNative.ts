import { Platform } from 'react-native';
import Constants from 'expo-constants';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

let configured = false;
let hasNativeModule: boolean | null = null;

function checkNativeModuleAvailable(): boolean {
  if (hasNativeModule !== null) return hasNativeModule;
  if (Platform.OS !== 'android') {
    hasNativeModule = false;
    return false;
  }
  // Expo Go does not support GoogleSignin native module.
  if (Constants.appOwnership === 'expo') {
    hasNativeModule = false;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@react-native-google-signin/google-signin');
    hasNativeModule = true;
  } catch (e) {
    hasNativeModule = false;
  }
  return hasNativeModule;
}

export function isGoogleNativeEnabled() {
  return Boolean(webClientId) && checkNativeModuleAvailable();
}

export function configureGoogleNativeIfNeeded() {
  if (configured) return;
  if (!isGoogleNativeEnabled()) return;

  // Lazy require to avoid bundling native-only module on web.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');

  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });

  configured = true;
}


export async function getGoogleIdTokenViaNative(): Promise<{ idToken: string } | null> {
  if (!isGoogleNativeEnabled()) return null;
  configureGoogleNativeIfNeeded();


  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    const idToken = res?.data?.idToken;
    if (!idToken) return null;
    return { idToken };
  } catch (e: any) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { statusCodes } = require('@react-native-google-signin/google-signin');
    const code = e?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) return null;
    if (code === statusCodes.IN_PROGRESS) return null;
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return null;
    throw e;
  }
}
