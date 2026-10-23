import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { queueOfflineMutation } from '../offline/syncQueue';

const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken);
          original.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(original);
        } catch {
          useAuthStore.getState().logout();
        }
      }
    }

    // Queue mutating requests when offline
    if (!navigator.onLine && original && ['post', 'put', 'patch', 'delete'].includes((original.method || '').toLowerCase())) {
      await queueOfflineMutation({
        method: (original.method || 'post').toUpperCase(),
        url: original.url || '',
        data: original.data,
        headers: { Authorization: original.headers?.Authorization as string },
      });
      return Promise.resolve({
        data: { success: true, offlineQueued: true, message: 'Saved offline — will sync when online' },
        status: 202,
        statusText: 'Accepted',
        headers: {},
        config: original,
      });
    }

    return Promise.reject(error);
  }
);

export default api;
