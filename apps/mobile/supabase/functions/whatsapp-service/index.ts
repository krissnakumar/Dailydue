/**
 * Supabase Edge Function: whatsapp-service (Deno)
 * Integração Oficial com a Meta WhatsApp Cloud API
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || '';
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID') || '';
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('WEBHOOK_VERIFY_TOKEN') || 'dailydue_seguro_token';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Dispara a mensagem transacional direta pela Cloud API da Meta
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
    throw new Error(`Erro na API da Meta: ${JSON.stringify(data)}`);
  }
  return data;
}

serve(async (req) => {
  // Tratamento de requisições de preflight (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ==========================================================================
  // HANDSHAKE DE VERIFICAÇÃO DO WEBHOOK (Painel de Desenvolvedores da Meta)
  // ==========================================================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook validado com sucesso pela Meta!');
      return new Response(challenge, { status: 200 });
    }
    return new Response('Acesso Proibido', { status: 403 });
  }

  // ==========================================================================
  // DISPARO DE MENSAGENS TRANSACIONAIS (Chamadas internas seguras)
  // ==========================================================================
  try {
    const { action, customerPhone, customerName, amount, pixString } = await req.json();

    if (!customerPhone || !action) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios ausentes: action, customerPhone' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Formatação de moeda simples em Deno
    const formatBRL = (val: number) => `R$ ${Number(val).toFixed(2).replace('.', ',')}`;
    const firstName = customerName ? customerName.split(' ')[0] : 'Cliente';
    let messageBody = '';

    // Lógica e Templates Empáticos Locais (Sem agressividade)
    switch (action) {
      case 'send_reminder':
        messageBody = `Olá ${firstName} 🙂 tudo bem? Passando para lembrar do seu saldo pendente de ${formatBRL(amount)} no nosso Caderninho de Fiado.\n\nQuando tiver um tempinho de passar por aqui, agradecemos muito! 🙏`;
        if (pixString) {
          messageBody += `\n\nPara facilitar, segue a nossa chave PIX Copia e Cola:\n\n${pixString}`;
        }
        break;

      case 'send_payment_confirmation':
        messageBody = `Que maravilha, ${firstName}! ✨ Recebemos o seu pagamento de ${formatBRL(amount)} e já demos baixa no Caderninho.\n\nMuito obrigado pela preferência e amizade de sempre! 🤝`;
        break;

      case 'send_overdue_alert':
        messageBody = `Olá ${firstName}, como vai? 📒 Notamos que a sua continha no valor de ${formatBRL(amount)} está em aberto há algum tempo.\n\nSabemos que a correria do dia a dia é grande, então se preferir, você pode quitar direto pelo PIX Copia e Cola abaixo:\n\n${pixString || 'Chave PIX da loja'}\n\nForte abraço!`;
        break;

      default:
        throw new Error('Ação não reconhecida.');
    }

    // Dispara via Graph API
    const metaResponse = await sendWhatsAppMessage(customerPhone, messageBody);

    return new Response(
      JSON.stringify({ success: true, metaResponse }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Erro no processamento do WhatsApp Service:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
