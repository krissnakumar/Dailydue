import { useEffect, useState } from 'react';
import { supabase } from '@controle-fiado/api';

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let active = true;

    const checkConnection = async () => {
      try {
        // Try contacting the Supabase endpoint to verify direct API availability
        const { error } = await supabase.auth.getSession();
        if (error) throw error;
        if (active) setIsOffline(false);
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        // If it's a transient network or timeout error, mark offline
        if (
          msg.includes('network') ||
          msg.includes('fetch') ||
          msg.includes('timeout') ||
          msg.includes('aborted') ||
          err?.status === 0
        ) {
          if (active) setIsOffline(true);
        } else {
          // Other API errors mean we are connected to the network
          if (active) setIsOffline(false);
        }
      }
    };

    checkConnection();
    
    // Check connectivity every 12 seconds to save battery/data
    const interval = setInterval(checkConnection, 12000);
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return isOffline;
}
