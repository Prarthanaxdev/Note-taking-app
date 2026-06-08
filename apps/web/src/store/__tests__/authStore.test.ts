import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../authStore.js';

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isBootstrapping: true });
});

describe('authStore', () => {
  it('T50-a: initial state has null accessToken and user', () => {
    const { accessToken, user } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();
  });

  it('T50-b: setAccessToken updates accessToken', () => {
    useAuthStore.getState().setAccessToken('tok123');
    expect(useAuthStore.getState().accessToken).toBe('tok123');
  });

  it('T50-c: clearAuth resets accessToken and user to null', () => {
    useAuthStore.setState({ accessToken: 'tok', user: { id: '1', email: 'a@b.com' } });
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setUser updates user profile', () => {
    useAuthStore.getState().setUser({ id: 'u1', email: 'user@example.com' });
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'user@example.com' });
  });

  it('AUTH-STORE-01: initial isBootstrapping is true', () => {
    expect(useAuthStore.getState().isBootstrapping).toBe(true);
  });

  it('AUTH-STORE-02: setBootstrappingDone sets isBootstrapping to false', () => {
    useAuthStore.getState().setBootstrappingDone();
    expect(useAuthStore.getState().isBootstrapping).toBe(false);
  });
});
