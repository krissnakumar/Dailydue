import * as Linking from 'expo-linking';
import { supabase } from '@dailydue/api';

export type OAuthCallbackParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
};

export function parseOAuthCallbackParams(urlStr: string): OAuthCallbackParams {
  if (!urlStr) {
    return { code: null, accessToken: null, refreshToken: null, error: null };
  }

  const normalizedUrl = urlStr.replace('#', urlStr.includes('?') ? '&' : '?');

  const readParam = (key: string): string | null => {
    try {
      const parsed = Linking.parse(normalizedUrl);
      const qp = (parsed?.queryParams as Record<string, string | string[] | undefined>) || {};
      const value = qp[key];
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    } catch {
      const regex = new RegExp(`[?&]${key}=([^&]*)`);
      const match = normalizedUrl.match(regex);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    return null;
  };

  return {
    code: readParam('code'),
    accessToken: readParam('access_token'),
    refreshToken: readParam('refresh_token'),
    error: readParam('error_description') || readParam('error'),
  };
}

export function isAuthCallbackUrl(url: string): boolean {
  if (url.startsWith('dailydue://')) return true;
  const normalizedUrl = url.replace('#', url.includes('?') ? '&' : '?');
  const parsed = Linking.parse(normalizedUrl);
  return (
    parsed.path === 'auth/callback' ||
    parsed.path === '--/auth/callback' ||
    parsed.path?.endsWith('/--/auth/callback') ||
    parsed.path?.endsWith('--/auth/callback') ||
    false
  );
}

export async function establishSessionFromOAuthParams(params: OAuthCallbackParams) {
  if (params.error) {
    throw new Error(params.error);
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return data.session;
  }

  if (params.accessToken && params.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) throw error;
    return data.session;
  }

  throw new Error('OAUTH_CODE_MISSING');
}
