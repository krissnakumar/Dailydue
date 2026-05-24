import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { okCors, jsonResponse } from '../_shared/cors.ts';
import { getBearerToken, getServiceClient } from '../_shared/supabase.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return okCors();
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });

  try {
    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });

    const supabase = getServiceClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });
    const user = userRes.user;

    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!sub) return jsonResponse({ ok: true, refreshed: false });

    if (sub.provider === 'mercado_pago' && MP_ACCESS_TOKEN && sub.provider_subscription_id) {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${sub.provider_subscription_id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const mpData = await mpRes.json().catch(() => null);
      if (mpRes.ok && mpData) {
        const statusRaw = String(mpData.status || '');
        const status = statusRaw === 'authorized' || statusRaw === 'active'
          ? 'active'
          : statusRaw === 'pending'
            ? 'pending'
            : statusRaw === 'paused'
              ? 'past_due'
              : (statusRaw === 'cancelled' || statusRaw === 'canceled')
                ? 'canceled'
                : statusRaw === 'expired'
                  ? 'expired'
                  : 'pending';

        await supabase.from('user_subscriptions').update({
          status,
          current_period_end: mpData?.auto_recurring?.end_date || null,
          last_verified_at: new Date().toISOString(),
          raw_provider_status: statusRaw,
        }).eq('user_id', user.id);
      }
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});

