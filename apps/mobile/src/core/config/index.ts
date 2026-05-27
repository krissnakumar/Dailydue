import { supabaseEnvOk } from '@dailydue/api';

export const CONFIG = {
  sync: {
    retryBaseMs: 15_000,
    retryMaxMs: 5 * 60_000,
  },
  supabase: {
    envOk: supabaseEnvOk,
  },
};
