import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { okCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || '';
const MP_WEBHOOK_SECRET = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') || '';

async function verifySignature(req: Request, rawBody: string) {
  if (!MP_WEBHOOK_SECRET) return true; // allow in dev if secret not configured

  const sig = req.headers.get('x-signature') || '';
  if (!sig) return false;

  // Minimal integrity check: HMAC-SHA256(rawBody, secret) == x-signature
  // (Mercado Pago signature formats can differ; production should align with MP docs.)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return sig.trim() === hex;
}

function mapMpStatus(status: string | null | undefined) {
  const s = String(status || '').toLowerCase();
  if (s === 'authorized' || s === 'active') return 'active';
  if (s === 'pending') return 'pending';
  if (s === 'paused' || s === 'rejected') return 'past_due';
  if (s === 'cancelled' || s === 'canceled') return 'canceled';
  if (s === 'expired') return 'expired';
  return 'pending';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return okCors();
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });

  try {
    if (!MP_ACCESS_TOKEN) return jsonResponse({ error: 'MISSING_MERCADO_PAGO_ACCESS_TOKEN' }, { status: 500 });

    const rawBody = await req.text();
    const isValid = await verifySignature(req, rawBody);
    if (!isValid) return jsonResponse({ error: 'INVALID_SIGNATURE' }, { status: 401 });

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const topic = payload?.type || payload?.topic || payload?.action || '';
    const dataId = payload?.data?.id || payload?.id || null;

    const supabase = getServiceClient();

    // Deduplicate best-effort using provider_event_id when available
    const providerEventId = payload?.id ? String(payload.id) : null;
    if (providerEventId) {
      const { data: existing } = await supabase
        .from('payment_events')
        .select('id')
        .eq('provider', 'mercado_pago')
        .eq('provider_event_id', providerEventId)
        .maybeSingle();
      if (existing?.id) return jsonResponse({ ok: true, deduped: true });
    }

    await supabase.from('payment_events').insert([{
      provider: 'mercado_pago',
      event_type: String(topic || 'webhook'),
      provider_event_id: providerEventId,
      provider_subscription_id: dataId ? String(dataId) : null,
      payload,
      processed: false,
    }]);

    // Fetch full preapproval if possible
    let sub: any = null;
    if (dataId) {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      sub = await mpRes.json().catch(() => null);
    }

    const externalRef = sub?.external_reference || payload?.external_reference || null;
    const userId = externalRef ? String(externalRef) : null;
    if (!userId) {
      await supabase.from('payment_events')
        .update({ processed: true, processing_error: 'MISSING_EXTERNAL_REFERENCE' })
        .eq('provider', 'mercado_pago')
        .eq('provider_event_id', providerEventId);
      return jsonResponse({ ok: true });
    }

    const status = mapMpStatus(sub?.status || payload?.status);
    const currentEnd = sub?.auto_recurring?.end_date || null;

    await supabase.from('user_subscriptions').upsert([{
      user_id: userId,
      plan_id: 'premium_monthly',
      plan: 'premium_monthly',
      status,
      provider: 'mercado_pago',
      source_platform: 'web',
      provider_product_id: 'premium_monthly',
      provider_subscription_id: dataId ? String(dataId) : null,
      current_period_end: currentEnd,
      last_verified_at: new Date().toISOString(),
      raw_provider_status: String(sub?.status || payload?.status || ''),
    }], { onConflict: 'user_id' });

    await supabase.from('payment_events')
      .update({ processed: true })
      .eq('provider', 'mercado_pago')
      .eq('provider_event_id', providerEventId);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
