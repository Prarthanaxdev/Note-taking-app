import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { AuthResponse } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export function mapAuthError(err: unknown): { field: string; message: string } {
  const code = isAxiosError(err)
    ? (err.response?.data?.error?.code as string | undefined)
    : undefined;
  const map: Record<string, { field: string; message: string }> = {
    INVALID_CREDENTIALS: { field: 'root', message: 'Incorrect email or password.' },
    EMAIL_TAKEN: { field: 'email', message: 'An account with this email already exists.' },
    OTP_EXPIRED: { field: 'otp', message: 'This code has expired. Request a new one.' },
    OTP_USED: { field: 'otp', message: 'This code has already been used.' },
    OTP_INVALID: { field: 'otp', message: 'Invalid code. Check and try again.' },
  };
  return map[code ?? ''] ?? { field: 'root', message: 'Something went wrong. Please try again.' };
}

export function useAuth() {
  const login = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiClient.post<AuthResponse>('/auth/login', data).then((r) => r.data),
  });

  const register = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiClient.post<AuthResponse>('/auth/register', data).then((r) => r.data),
  });

  const logout = useMutation({
    mutationFn: () => Promise.resolve(),
  });

  const forgotPassword = useMutation({
    mutationFn: (data: { email: string }) =>
      apiClient.post('/auth/forgot-password', data).then((r) => r.data),
  });

  const resetPassword = useMutation({
    mutationFn: (data: { email: string; otp: string; newPassword: string }) =>
      apiClient.post('/auth/reset-password', data).then((r) => r.data),
  });

  return { login, register, logout, forgotPassword, resetPassword };
}
