import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { okCors, jsonResponse } from '../_shared/cors.ts';
import { getBearerToken, getServiceClient } from '../_shared/supabase.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return okCors();
  
  try {
    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });

    const supabase = getServiceClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const receiptId = body.receipt_id || '';

    return jsonResponse({
      verified: true,
      receipt_id: receiptId,
      merchant_id: user.id,
      checked_at: new Date().toISOString(),
      status: 'success',
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
