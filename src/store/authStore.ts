import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { offlineQueue, setupOfflineQueueListeners } from '../utils/offlineQueue';
import { indexedDBManager } from '../utils/indexedDB';

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

interface OfflineState {
  isOnline: boolean;
  queuedRequests: number;
  lastSyncTime: number | null;
  syncInProgress: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  offline: OfflineState;
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
  // Offline actions
  setOnlineStatus: (isOnline: boolean) => void;
  updateQueuedRequests: () => Promise<void>;
  syncOfflineData: () => Promise<void>;
  clearOfflineQueue: () => Promise<void>;
  getOfflineStatus: () => OfflineState;
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
      offline: {
        isOnline: navigator.onLine,
        queuedRequests: 0,
        lastSyncTime: null,
        syncInProgress: false
      },

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
          const { token, offline } = get();
          
          if (!token) {
            return;
          }

          set({ isLoading: true });
          
          // If offline, try to get cached user data
          if (!offline.isOnline) {
            try {
              const cachedUser = await indexedDBManager.get('userData', 'currentUser');
            if (cachedUser && cachedUser.data && typeof cachedUser.data === 'object' && 'email' in cachedUser.data) {
              set({ 
                user: cachedUser.data as User,
                isLoading: false
              });
              return;
            }
            } catch (error) {
              console.log('No cached user data available');
            }
          }
          
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
            // Cache user data for offline use
            await indexedDBManager.store('userData', data.data, Date.now());
            
            set({ 
              user: data.data,
              isLoading: false
            });
          } else {
            throw new Error(data.error || 'Failed to refresh user data');
          }
        } catch (error) {
          console.error('Refresh user error:', error);
          
          // If offline and we have cached data, use it
          if (!navigator.onLine) {
            try {
              const cachedUser = await indexedDBManager.get('userData', 'currentUser');
              if (cachedUser && cachedUser.data && typeof cachedUser.data === 'object' && 'email' in cachedUser.data) {
                set({ 
                  user: cachedUser.data as User,
                  isLoading: false
                });
                return;
              }
            } catch (cacheError) {
              console.log('No cached user data available');
            }
          }
          
          set({ 
            error: error instanceof Error ? error.message : 'Failed to refresh user data',
            isLoading: false
          });
        }
      },

      // Offline management actions
      setOnlineStatus: (isOnline: boolean) => {
        set((state) => ({
          offline: {
            ...state.offline,
            isOnline
          }
        }));
        
        // If back online, sync data
        if (isOnline) {
          get().syncOfflineData();
        }
      },

      updateQueuedRequests: async () => {
        try {
          const status = await offlineQueue.getStatus();
          set((state) => ({
            offline: {
              ...state.offline,
              queuedRequests: status.total
            }
          }));
        } catch (error) {
          console.error('Failed to update queued requests count:', error);
        }
      },

      syncOfflineData: async () => {
        const { offline } = get();
        
        if (!offline.isOnline || offline.syncInProgress) {
          return;
        }

        try {
          set((state) => ({
            offline: {
              ...state.offline,
              syncInProgress: true
            }
          }));

          // Process offline queue
          await offlineQueue.processQueue();
          
          // Update queue count
          await get().updateQueuedRequests();
          
          set((state) => ({
            offline: {
              ...state.offline,
              syncInProgress: false,
              lastSyncTime: Date.now()
            }
          }));
          
          console.log('Offline data sync completed');
        } catch (error) {
          console.error('Failed to sync offline data:', error);
          set((state) => ({
            offline: {
              ...state.offline,
              syncInProgress: false
            }
          }));
        }
      },

      clearOfflineQueue: async () => {
        try {
          await offlineQueue.clearQueue();
          await get().updateQueuedRequests();
          console.log('Offline queue cleared');
        } catch (error) {
          console.error('Failed to clear offline queue:', error);
        }
      },

      getOfflineStatus: () => {
        return get().offline;
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