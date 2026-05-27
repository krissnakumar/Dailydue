import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { okCors, jsonResponse } from '../_shared/cors.ts';
import { getBearerToken, getServiceClient } from '../_shared/supabase.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || '';
const WEB_APP_URL = Deno.env.get('WEB_APP_URL') || '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return okCors();
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });

  try {
    if (!MP_ACCESS_TOKEN) return jsonResponse({ error: 'MISSING_MERCADO_PAGO_ACCESS_TOKEN' }, { status: 500 });
    if (!WEB_APP_URL) return jsonResponse({ error: 'MISSING_WEB_APP_URL' }, { status: 500 });

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });

    const supabase = getServiceClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const planId = body?.planId;
    if (planId !== 'premium_monthly') return jsonResponse({ error: 'INVALID_PLAN' }, { status: 400 });

    const payerEmail = user.email;
    if (!payerEmail) return jsonResponse({ error: 'USER_EMAIL_REQUIRED' }, { status: 400 });

    const mpPayload = {
      reason: 'DailyDue Premium Mensal',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 11.99,
        currency_id: 'BRL',
      },
      payer_email: payerEmail,
      external_reference: user.id,
      back_url: `${WEB_APP_URL.replace(/\/$/, '')}/billing/success`,
    };

    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mpPayload),
    });
    const mpData = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      await supabase.from('payment_events').insert([{
        user_id: user.id,
        provider: 'mercado_pago',
        event_type: 'create_preapproval_failed',
        provider_event_id: null,
        payload: mpData,
        processed: false,
        processing_error: `HTTP_${mpRes.status}`,
      }]);
      return jsonResponse({ error: 'MERCADO_PAGO_ERROR', details: mpData }, { status: 502 });
    }

    const subscriptionId = mpData?.id || mpData?.preapproval_id || null;
    const initPoint = mpData?.init_point || null;
    if (!subscriptionId || !initPoint) {
      return jsonResponse({ error: 'MERCADO_PAGO_INVALID_RESPONSE', details: mpData }, { status: 502 });
    }

    // Record pending subscription (do not grant premium here)
    await supabase.from('user_subscriptions').upsert([{
      user_id: user.id,
      plan_id: 'premium_monthly',
      plan: 'premium_monthly',
      status: 'pending',
      provider: 'mercado_pago',
      source_platform: 'web',
      provider_product_id: 'premium_monthly',
      provider_subscription_id: String(subscriptionId),
      raw_provider_status: String(mpData?.status || 'pending'),
      last_verified_at: new Date().toISOString(),
    }], { onConflict: 'user_id' });

    await supabase.from('payment_events').insert([{
      user_id: user.id,
      provider: 'mercado_pago',
      event_type: 'create_preapproval',
      provider_event_id: null,
      provider_subscription_id: String(subscriptionId),
      payload: mpData,
      processed: true,
    }]);

    return jsonResponse({ init_point: initPoint, subscription_id: subscriptionId });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
