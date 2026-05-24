import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { jsonResponse, okCors } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

const GOOGLE_PLAY_PACKAGE_NAME = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') || '';
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || '';

// This webhook expects a Pub/Sub push JSON body; verification of source should be added in production

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

function mapGoogleStatus(raw: any): string {
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
    if (!GOOGLE_PLAY_PACKAGE_NAME || !GOOGLE_SERVICE_ACCOUNT_JSON) {
      return jsonResponse({ error: 'MISSING_GOOGLE_ENV' }, { status: 500 });
    }

    const supabase = getServiceClient();
    const payload = await req.json().catch(() => ({}));
    const msg = payload?.message?.data;
    if (!msg) return jsonResponse({ ok: true });

    const decoded = JSON.parse(atob(String(msg)));
    const purchaseToken = decoded?.subscriptionNotification?.purchaseToken || decoded?.purchaseToken || null;
    if (!purchaseToken) return jsonResponse({ ok: true });

    // Find subscription by purchase token
    const { data: subRow } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('provider', 'google_play')
      .eq('provider_purchase_token', String(purchaseToken))
      .maybeSingle();

    if (!subRow?.user_id) {
      await supabase.from('payment_events').insert([{
        provider: 'google_play',
        event_type: 'rtdn_unmatched',
        provider_purchase_token: String(purchaseToken),
        payload: decoded,
        processed: true,
      }]);
      return jsonResponse({ ok: true });
    }

    const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const googleRes = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const googleData = await googleRes.json().catch(() => ({}));

    if (!googleRes.ok) {
      await supabase.from('payment_events').insert([{
        user_id: subRow.user_id,
        provider: 'google_play',
        event_type: 'rtdn_verify_failed',
        provider_purchase_token: String(purchaseToken),
        payload: googleData,
        processed: false,
        processing_error: `HTTP_${googleRes.status}`,
      }]);
      return jsonResponse({ ok: true });
    }

    const status = mapGoogleStatus(googleData);
    const expiryMillis =
      googleData?.lineItems?.[0]?.expiryTime
        ? Date.parse(String(googleData.lineItems[0].expiryTime))
        : null;
    const currentEnd = expiryMillis ? new Date(expiryMillis).toISOString() : null;

    await supabase.from('user_subscriptions').update({
      plan_id: 'premium_monthly',
      plan: 'premium_monthly',
      status,
      current_period_end: currentEnd,
      cancel_at_period_end: false,
      raw_provider_status: String(googleData?.subscriptionState || ''),
      last_verified_at: new Date().toISOString(),
    }).eq('user_id', subRow.user_id);

    await supabase.from('payment_events').insert([{
      user_id: subRow.user_id,
      provider: 'google_play',
      event_type: 'rtdn_sync',
      provider_purchase_token: String(purchaseToken),
      payload: decoded,
      processed: true,
    }]);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
