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

    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id);

    const { data: transactions } = await supabase
      .from('customer_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    return jsonResponse({
      merchant_id: user.id,
      generated_at: new Date().toISOString(),
      summary: {
        total_customers: customers?.length || 0,
        total_transactions: transactions?.length || 0,
      },
      customers,
      transactions,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
