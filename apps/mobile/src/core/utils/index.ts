export function localId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch (e) {
    // ignore
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

export function isTempCustomerId(val: string): boolean {
  const id = String(val || '');
  if (!id) return false;
  if (
    id.startsWith('cust_') ||
    id.startsWith('temp_') ||
    id.startsWith('local_') ||
    id.startsWith('pending_')
  ) {
    return true;
  }
  return !isUuid(id);
}

export function isEmoji(str?: string): boolean {
  if (!str) return false;
  const s = String(str).trim();
  try {
    // Robust Unicode regex to detect presentation emojis and emoji modifiers safely
    const emojiRegex = /^[\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200d\u{1F3FB}-\u{1F3FF}]+$/u;
    return emojiRegex.test(s) && s.length <= 12;
  } catch {
    // Fallback if environment doesn't support full unicode property regexes
    return s.length <= 4 && !s.includes('/') && !s.startsWith('data:');
  }
}

export function isTransientNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.description || err || '').toLowerCase();
  
  if (
    msg.includes('network request failed') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('connection aborted') ||
    msg.includes('offline')
  ) {
    return true;
  }
  
  if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504) {
    return true;
  }
  
  return false;
}

export function formatCurrency(amount: number): string {
  return Number(amount || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function sanitizePhone(phone: string): string {
  return phone ? phone.replace(/\D/g, '') : '';
}
