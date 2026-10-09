import axios from 'axios';
import { API_BASE, refreshSession } from './session';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const orgId = localStorage.getItem('active_org_id');
    if (orgId) {
      config.headers['x-organization-id'] = orgId;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken && !error.config._retry) {
        error.config._retry = true;
        try {
          const token = await refreshSession();
          error.config.headers.Authorization = `Bearer ${token}`;
          return api(error.config);
        } catch {
          // Falhas transitórias preservam a sessão e rejeitam a requisição original.
        }
      }
    }
    const message = error.response?.data?.message || error.message;
    const wrapped = new Error(Array.isArray(message) ? message[0] : message) as Error & { status?: number; body?: any };
    wrapped.status = error.response?.status;
    wrapped.body = error.response?.data;
    return Promise.reject(wrapped);
  },
);
