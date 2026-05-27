import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

let globalOffline = false;
const listeners = new Set<(offline: boolean) => void>();
let monitorStarted = false;
let checkTimeout: ReturnType<typeof setTimeout> | null = null;

async function probeGoogle204(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeoutId);
    return res.status >= 200 && res.status < 400;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

async function probeSupabase(): Promise<boolean> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

const checkConnection = async () => {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    updateStatus(!navigator.onLine);
    return;
  }

  const online = (await probeGoogle204()) || (await probeSupabase());
  updateStatus(!online);
};

const updateStatus = (offline: boolean) => {
  if (globalOffline !== offline) {
    globalOffline = offline;
    listeners.forEach((listener) => listener(offline));
  }
};

const startGlobalMonitor = () => {
  if (monitorStarted) return;
  monitorStarted = true;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => updateStatus(false));
    window.addEventListener('offline', () => updateStatus(true));
  }

  void checkConnection();

  const runPoll = async () => {
    await checkConnection();
    checkTimeout = setTimeout(runPoll, 15_000);
  };
  checkTimeout = setTimeout(runPoll, 15_000);
};

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(globalOffline);

  useEffect(() => {
    startGlobalMonitor();

    const listener = (offline: boolean) => {
      setIsOffline(offline);
    };

    listeners.add(listener);
    setIsOffline(globalOffline);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return isOffline;
}

export default useNetworkStatus;
