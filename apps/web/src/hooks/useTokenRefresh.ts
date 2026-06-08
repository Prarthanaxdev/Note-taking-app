import { useEffect } from 'react';
import axios from 'axios';
import type { AuthResponse } from 'shared';
import { useAuthStore } from '../store/authStore.js';

export function useTokenRefresh(): void {
  useEffect(() => {
    axios
      .post<AuthResponse>('/api/v1/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        useAuthStore.getState().setAccessToken(data.accessToken);
      })
      .catch(() => {
        useAuthStore.getState().clearAuth();
      })
      .finally(() => {
        useAuthStore.getState().setBootstrappingDone();
      });
  }, []);
}
