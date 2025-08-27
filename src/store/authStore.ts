import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  phone_number?: string;
  address?: string;
  role: 'Admin' | 'Imam' | 'Pengurus' | 'Jamaah';
  created_at: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      setUser: (user: User) => {
        set({ user, isAuthenticated: true });
      },

      setToken: (token: string) => {
        set({ token });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },

      login: async (token: string) => {
        try {
          set({ isLoading: true, error: null });
          
          // Store token
          set({ token });
          
          // Fetch user profile
          const response = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch user profile');
          }

          const data = await response.json();
          
          if (data.success && data.data) {
            set({ 
              user: data.data, 
              isAuthenticated: true,
              isLoading: false 
            });
          } else {
            throw new Error(data.error || 'Failed to get user data');
          }
        } catch (error) {
          console.error('Login error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
            token: null,
            user: null,
            isAuthenticated: false
          });
        }
      },

      logout: async () => {
        try {
          const { token } = get();
          
          if (token) {
            // Call logout endpoint
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear state regardless of API call success
          set({ 
            user: null, 
            token: null, 
            isAuthenticated: false,
            error: null
          });
        }
      },

      refreshUser: async () => {
        try {
          const { token } = get();
          
          if (!token) {
            return;
          }

          set({ isLoading: true });
          
          const response = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            if (response.status === 401) {
              // Token expired, logout
              get().logout();
              return;
            }
            throw new Error('Failed to refresh user data');
          }

          const data = await response.json();
          
          if (data.success && data.data) {
            set({ 
              user: data.data,
              isLoading: false
            });
          } else {
            throw new Error(data.error || 'Failed to refresh user data');
          }
        } catch (error) {
          console.error('Refresh user error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to refresh user data',
            isLoading: false
          });
        }
      }
    }),
    {
      name: 'masjeed-auth',
      partialize: (state) => ({ 
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

export default useAuthStore;
export type { User, AuthState, AuthActions };