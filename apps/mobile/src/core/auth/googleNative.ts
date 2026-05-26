import { nativeAuth } from '../native/auth';

export function isGoogleNativeEnabled() {
  return nativeAuth.isGoogleNativeEnabled();
}

export function configureGoogleNativeIfNeeded() {
  nativeAuth.configureGoogleNativeIfNeeded();
}

export async function getGoogleIdTokenViaNative() {
  return nativeAuth.getGoogleIdToken();
}
