import { supabase } from '@controle-fiado/api';
import { storage } from '../storage/storage';

export const authService = {
  getCurrentSession: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (data.session) {
      await storage.setSecureItem('session_access_token', data.session.access_token || '');
      await storage.setSecureItem('session_refresh_token', data.session.refresh_token || '');
    }

    return data.session;
  },

  validateAndRefreshSession: async (): Promise<boolean> => {
    try {
      const session = await authService.getCurrentSession();
      if (!session) {
        const savedRefreshToken = await storage.getSecureItem('session_refresh_token');
        if (savedRefreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: '',
            refresh_token: savedRefreshToken
          });
          if (!error && data.session) {
            console.log('[Auth Service] Recovered and refreshed session from secure storage.');
            return true;
          }
        }
        return false;
      }
      
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        console.warn('[Auth Service] Session validation failed on server:', error);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  },

  signOut: async () => {
    await storage.removeSecureItem('session_access_token');
    await storage.removeSecureItem('session_refresh_token');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};

export default authService;
