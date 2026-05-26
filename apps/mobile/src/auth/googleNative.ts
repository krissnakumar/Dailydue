import { nativeAuth } from '../core/native/auth';

export function isGoogleNativeEnabled() {
  return nativeAuth.isGoogleNativeEnabled();
}

export function configureGoogleNativeIfNeeded() {
  nativeAuth.configureGoogleNativeIfNeeded();
}

export async function getGoogleIdTokenViaNative() {
  return nativeAuth.getGoogleIdToken();
}
