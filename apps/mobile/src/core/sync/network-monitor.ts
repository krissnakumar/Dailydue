import { supabase } from '@controle-fiado/api';

export const networkMonitor = {
  subscribe: (callback: (isConnected: boolean) => void) => {
    let active = true;
    const checkConnection = async () => {
      try {
        const { error } = await supabase.auth.getSession();
        if (active) callback(!error);
      } catch {
        if (active) callback(false);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 12000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  },
  isConnected: async (): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.getSession();
      return !error;
    } catch {
      return false;
    }
  },
};
export default networkMonitor;
