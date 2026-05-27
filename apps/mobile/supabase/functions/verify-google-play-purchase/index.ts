import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { okCors, jsonResponse } from '../_shared/cors.ts';
import { getBearerToken, getServiceClient } from '../_shared/supabase.ts';

const GOOGLE_PLAY_PACKAGE_NAME = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') || '';
const GOOGLE_PLAY_PREMIUM_PRODUCT_ID =
  Deno.env.get('GOOGLE_PLAY_PREMIUM_PRODUCT_ID') ||
  Deno.env.get('EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID') ||
  'fiado_premium';
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || '';
const PREMIUM_PLAN_ID = 'premium_monthly';

function pemToArrayBuffer(pem: string) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(input: Uint8Array) {
  const b64 = btoa(String.fromCharCode(...input));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signJwtRS256(privateKeyPem: string, header: any, payload: any) {
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

async function getGoogleAccessToken(serviceAccount: any) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwtRS256(
    serviceAccount.private_key,
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GOOGLE_TOKEN_ERROR:${res.status}:${JSON.stringify(data)}`);
  return String(data.access_token);
}

function mapGoogleStatus(raw: any): 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'revoked' {
  // subscriptionsv2 is complex; we use best-effort mapping from known fields
  const state = String(raw?.subscriptionState || raw?.state || '').toUpperCase();
  if (state.includes('ACTIVE')) return 'active';
  if (state.includes('TRIAL')) return 'trialing';
  if (state.includes('GRACE') || state.includes('ON_HOLD')) return 'past_due';
  if (state.includes('CANCELED') || state.includes('CANCELLED')) return 'canceled';
  if (state.includes('EXPIRED')) return 'expired';
  if (state.includes('REVOKED') || state.includes('REFUNDED')) return 'revoked';
  return 'active';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return okCors();
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });

  try {
    if (!GOOGLE_PLAY_PACKAGE_NAME) return jsonResponse({ error: 'MISSING_GOOGLE_PLAY_PACKAGE_NAME' }, { status: 500 });
    if (!GOOGLE_PLAY_PREMIUM_PRODUCT_ID) return jsonResponse({ error: 'MISSING_GOOGLE_PLAY_PREMIUM_PRODUCT_ID' }, { status: 500 });
    if (!GOOGLE_SERVICE_ACCOUNT_JSON) return jsonResponse({ error: 'MISSING_GOOGLE_SERVICE_ACCOUNT_JSON' }, { status: 500 });

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });

    const supabase = getServiceClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });
    const user = userRes.user;

    const body = await req.json();
    const productId = body?.productId;
    const purchaseToken = body?.purchaseToken;
    const packageName = body?.packageName;

    if (packageName !== GOOGLE_PLAY_PACKAGE_NAME) return jsonResponse({ error: 'INVALID_PACKAGE_NAME' }, { status: 400 });
    if (productId !== GOOGLE_PLAY_PREMIUM_PRODUCT_ID) return jsonResponse({ error: 'INVALID_PRODUCT_ID' }, { status: 400 });
    if (!purchaseToken) return jsonResponse({ error: 'PURCHASE_TOKEN_REQUIRED' }, { status: 400 });

    // Prevent replay/linking of the same purchase token to multiple accounts.
    const { data: tokenOwner } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('provider', 'google_play')
      .eq('provider_purchase_token', String(purchaseToken))
      .maybeSingle();
    if (tokenOwner?.user_id && tokenOwner.user_id !== user.id) {
      return jsonResponse({ error: 'PURCHASE_TOKEN_ALREADY_LINKED' }, { status: 409 });
    }

    const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const googleRes = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const googleData = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      await supabase.from('payment_events').insert([{
        user_id: user.id,
        provider: 'google_play',
        event_type: 'verify_failed',
        provider_purchase_token: String(purchaseToken),
        payload: googleData,
        processed: false,
        processing_error: `HTTP_${googleRes.status}`,
      }]);
      return jsonResponse({ error: 'GOOGLE_VERIFY_FAILED', details: googleData }, { status: 502 });
    }

    const status = mapGoogleStatus(googleData);
    const expiryMillis =
      googleData?.lineItems?.[0]?.expiryTime
        ? Date.parse(String(googleData.lineItems[0].expiryTime))
        : null;
    const currentEnd = expiryMillis ? new Date(expiryMillis).toISOString() : null;

    const isPremiumActive =
      (status === 'active' || status === 'trialing') &&
      (!currentEnd || Date.parse(currentEnd) > Date.now());

    await supabase.from('user_subscriptions').upsert([{
      user_id: user.id,
      plan_id: PREMIUM_PLAN_ID,
      plan: PREMIUM_PLAN_ID,
      status,
      provider: 'google_play',
      source_platform: 'android',
      provider_product_id: String(productId),
      provider_purchase_token: String(purchaseToken),
      provider_order_id: googleData?.lineItems?.[0]?.orderId ? String(googleData.lineItems[0].orderId) : null,
      current_period_end: currentEnd,
      last_verified_at: new Date().toISOString(),
      raw_provider_status: String(googleData?.subscriptionState || ''),
    }], { onConflict: 'user_id' });

    await supabase.from('payment_events').insert([{
      user_id: user.id,
      provider: 'google_play',
      event_type: 'verify_purchase',
      provider_purchase_token: String(purchaseToken),
      payload: googleData,
      processed: true,
    }]);

    return jsonResponse({
      success: true,
      plan_id: PREMIUM_PLAN_ID,
      product_id: String(productId),
      status,
      current_period_end: currentEnd,
      is_premium: isPremiumActive,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
