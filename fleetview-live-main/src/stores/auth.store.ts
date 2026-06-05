import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/axios';
import type {
  User,
  LoginRequest,
  LoginResponse,
  ProfileResponse,
  EffectiveSettings,
} from '@/types/auth.types';

interface AuthState {
  user: User | null;
  settings: EffectiveSettings | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  setSettings: (settings: EffectiveSettings) => void;
  clearAuth: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      settings: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (credentials: LoginRequest) => {
        try {
          set({ isLoading: true });
          const response = await api.post<LoginResponse>('/auth/login', credentials);
          const { accessToken, refreshToken, user, settings } = response.data;

          set({
            user,
            settings: settings ?? null,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          const { refreshToken } = get();
          if (refreshToken) {
            await api.post('/auth/logout', { refreshToken });
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            user: null,
            settings: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken });
      },

      setUser: (user: User) => {
        set({ user, isAuthenticated: true });
      },

      setSettings: (settings: EffectiveSettings) => {
        set({ settings });
      },

      clearAuth: () => {
        set({
          user: null,
          settings: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      checkAuth: async () => {
        const { accessToken } = get();
        if (!accessToken) {
          set({ isAuthenticated: false });
          return;
        }

        try {
          set({ isLoading: true });
          const response = await api.get<ProfileResponse>('/auth/profile');
          const { settings, ...user } = response.data;
          set({
            user,
            settings: settings ?? null,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          console.error('Auth check failed:', error);
          set({
            user: null,
            settings: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        settings: state.settings,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
