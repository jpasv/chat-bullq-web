import axios from 'axios';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
let refreshPromise: Promise<string> | null = null;

export function isInvalidSession(error: unknown): boolean {
  return axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
}

/** REST e realtime compartilham a mesma renovação, inclusive a rotação do token. */
export function refreshSession(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
      throw new Error('Sessão sem token de renovação');
    }
    try {
      const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, { timeout: 10000 });
      localStorage.setItem('access_token', data.data.accessToken);
      localStorage.setItem('refresh_token', data.data.refreshToken);
      return data.data.accessToken as string;
    } catch (error) {
      if (isInvalidSession(error)) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
      throw error;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
