import { create } from 'zustand';
import type { UserProfile } from 'shared';

interface AuthState {
  accessToken: string | null;
  user: UserProfile | null;
  setAccessToken: (token: string) => void;
  setUser: (user: UserProfile) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAccessToken: (token) => set({ accessToken: token }),
  setUser: (user) => set({ user }),
  clearAuth: () => set({ accessToken: null, user: null }),
}));
