import { CONFIG } from './index';
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  devServerIp: process.env.EXPO_PUBLIC_DEV_SERVER_IP || '192.168.1.104',
  ...CONFIG,
};
export default env;
