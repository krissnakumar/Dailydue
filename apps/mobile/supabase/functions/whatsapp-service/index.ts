/**
 * Supabase Edge Function: whatsapp-service (Deno)
 * Official Meta WhatsApp Cloud API Integration
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || '';
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID') || '';
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('WEBHOOK_VERIFY_TOKEN') || 'dailydue_seguro_token';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sends the transactional message directly via Meta Cloud API
async function sendWhatsAppMessage(toPhone: string, text: string) {
  const url = `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'text',
      text: {
        preview_url: true,
        body: text,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Meta API Error: ${JSON.stringify(data)}`);
  }
  return data;
}

serve(async (req) => {
  // CORS preflight handling
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ==========================================================================
  // WEBHOOK VERIFICATION HANDSHAKE (Meta Developer Dashboard)
  // ==========================================================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook successfully validated by Meta!');
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // ==========================================================================
  // TRANSACTIONAL MESSAGE DISPATCH (Secure internal calls)
  // ==========================================================================
  try {
    const { action, customerPhone, customerName, amount, pixString } = await req.json();

    if (!customerPhone || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: action, customerPhone' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simple currency formatting in Deno
    const formatBRL = (val: number) => `R$ ${Number(val).toFixed(2).replace('.', ',')}`;
    const firstName = customerName ? customerName.split(' ')[0] : 'Customer';
    let messageBody = '';

    // Template messages in English (localized, friendly tone)
    switch (action) {
      case 'send_reminder':
        messageBody = `Hi ${firstName} 🙂 Just a friendly reminder about your pending balance of ${formatBRL(amount)} at the Ledger.\n\nWhen you get a moment, please stop by to settle it. Thank you! 🙏`;
        if (pixString) {
          messageBody += `\n\nTo make it easier, here is our UPI Copy & Paste key:\n\n${pixString}`;
        }
        break;

      case 'send_payment_confirmation':
        messageBody = `Great news, ${firstName}! ✨ We have received your payment of ${formatBRL(amount)} and updated the Ledger.\n\nThank you for your continued trust and preference! 🤝`;
        break;

      case 'send_overdue_alert':
        messageBody = `Hi ${firstName}, how are you? 📒 We noticed that your balance of ${formatBRL(amount)} has been open for a while.\n\nWe know life gets busy, so if you prefer, you can pay directly using our UPI Copy & Paste key below:\n\n${pixString || 'Store UPI Key'}\n\nBest regards!`;
        break;

      default:
        throw new Error('Unrecognized action.');
    }

    // Dispara via Graph API
    const metaResponse = await sendWhatsAppMessage(customerPhone, messageBody);

    return new Response(
      JSON.stringify({ success: true, metaResponse }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('WhatsApp Service processing error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
