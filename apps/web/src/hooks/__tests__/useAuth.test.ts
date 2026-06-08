import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useAuth, mapAuthError } from '../useAuth.js';

vi.mock('../../lib/apiClient.js', () => ({
  apiClient: { post: vi.fn() },
}));

import { apiClient } from '../../lib/apiClient.js';
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
});

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function makeAxiosError(code: string, status = 400) {
  const err = Object.assign(new Error('Request failed with status code ' + status), {
    isAxiosError: true,
    response: {
      status,
      data: { error: { code, message: code } },
      headers: {},
      config: {},
    },
    config: {},
    request: {},
  });
  return Promise.reject(err);
}

// ── AUTH-HOOK-01: login success ──────────────────────────────────────────────
describe('useAuth', () => {
  it('AUTH-HOOK-01: login resolves with accessToken on 200', async () => {
    mockPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    let data: { accessToken: string } | undefined;
    await act(async () => {
      data = await result.current.login.mutateAsync({
        email: 'a@b.com',
        password: 'secret123',
      });
    });
    expect(data?.accessToken).toBe('tok');
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      email: 'a@b.com',
      password: 'secret123',
    });
  });

  // ── AUTH-HOOK-02: login rejects on 401 INVALID_CREDENTIALS ──────────────────
  it('AUTH-HOOK-02: login rejects on 401 INVALID_CREDENTIALS', async () => {
    mockPost.mockReturnValueOnce(makeAxiosError('INVALID_CREDENTIALS', 401));
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    let caughtErr: unknown;
    await act(async () => {
      try {
        await result.current.login.mutateAsync({ email: 'a@b.com', password: 'wrong' });
      } catch (err) {
        caughtErr = err;
      }
    });
    expect(caughtErr).toBeDefined();
  });

  // ── AUTH-HOOK-06: register resolves on 201 ──────────────────────────────────
  it('AUTH-HOOK-06: register resolves with accessToken on 201', async () => {
    mockPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    let data: { accessToken: string } | undefined;
    await act(async () => {
      data = await result.current.register.mutateAsync({
        email: 'new@b.com',
        password: 'password1',
      });
    });
    expect(data?.accessToken).toBe('tok');
    expect(mockPost).toHaveBeenCalledWith('/auth/register', {
      email: 'new@b.com',
      password: 'password1',
    });
  });

  // ── AUTH-HOOK-07: forgotPassword resolves on 200 ────────────────────────────
  it('AUTH-HOOK-07: forgotPassword resolves on 200 without error', async () => {
    mockPost.mockResolvedValueOnce({ data: { message: 'If registered, OTP sent' } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    let threw = false;
    await act(async () => {
      try {
        await result.current.forgotPassword.mutateAsync({ email: 'a@b.com' });
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(false);
  });

  // ── AUTH-HOOK-08: resetPassword rejects on OTP_EXPIRED ──────────────────────
  it('AUTH-HOOK-08: resetPassword rejects and mapAuthError returns otp field', async () => {
    mockPost.mockReturnValueOnce(makeAxiosError('OTP_EXPIRED', 400));
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    let caughtErr: unknown;
    await act(async () => {
      try {
        await result.current.resetPassword.mutateAsync({
          email: 'a@b.com',
          otp: '123456',
          newPassword: 'newpass1',
        });
      } catch (err) {
        caughtErr = err;
      }
    });
    expect(caughtErr).toBeDefined();
    const mapped = mapAuthError(caughtErr);
    expect(mapped.field).toBe('otp');
    expect(mapped.message).toContain('expired');
  });
});

// ── AUTH-HOOK-03/04/05: mapAuthError pure function tests ────────────────────
describe('mapAuthError', () => {
  function makeErr(code: string | undefined) {
    return Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: {
        data: code !== undefined ? { error: { code } } : {},
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {},
      },
      config: {},
      request: {},
    });
  }

  it('AUTH-HOOK-03: INVALID_CREDENTIALS maps to root field', () => {
    expect(mapAuthError(makeErr('INVALID_CREDENTIALS'))).toEqual({
      field: 'root',
      message: 'Incorrect email or password.',
    });
  });

  it('AUTH-HOOK-04: EMAIL_TAKEN maps to email field', () => {
    expect(mapAuthError(makeErr('EMAIL_TAKEN'))).toEqual({
      field: 'email',
      message: 'An account with this email already exists.',
    });
  });

  it('AUTH-HOOK-05: unknown code maps to root with generic message', () => {
    expect(mapAuthError(makeErr('SOME_UNKNOWN_CODE'))).toEqual({
      field: 'root',
      message: 'Something went wrong. Please try again.',
    });
  });
});
