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

    const { data: metrics } = await supabase
      .from('customer_transactions')
      .select('transaction_type, amount')
      .eq('user_id', user.id);

    let totalDebt = 0;
    let totalPayment = 0;

    if (metrics) {
      for (const m of metrics) {
        if (m.transaction_type === 'debt') {
          totalDebt += Number(m.amount);
        } else if (m.transaction_type === 'payment') {
          totalPayment += Number(m.amount);
        }
      }
    }

    return jsonResponse({
      merchant_id: user.id,
      aggregated_at: new Date().toISOString(),
      analytics: {
        total_debt_issued: totalDebt,
        total_payment_received: totalPayment,
        current_outstanding_receivables: Math.max(0, totalDebt - totalPayment),
      },
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
