import { useEffect, useState } from 'react';
import { flushOfflineQueue, ensureClientId } from '../offline/syncQueue';
import { useAuthStore } from '../store/authStore';

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    ensureClientId();
    const on = () => {
      setOnline(true);
      if (token) void flushOfflineQueue(token);
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    if (navigator.onLine && token) void flushOfflineQueue(token);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [token]);

  return online;
}
