import { useState, useEffect, useCallback } from 'react';

interface PWAState {
  isOnline: boolean;
  isInstalled: boolean;
  isUpdateAvailable: boolean;
  isInstallPromptAvailable: boolean;
  swRegistration: ServiceWorkerRegistration | null;
  offlineQueue: Array<{
    id: string;
    type: string;
    data: any;
    timestamp: number;
    retries: number;
  }>;
}

interface UsePWAReturn extends PWAState {
  updateApp: () => Promise<void>;
  skipWaiting: () => void;
  registerForPushNotifications: () => Promise<PushSubscription | null>;
  unregisterPushNotifications: () => Promise<boolean>;
  addToOfflineQueue: (type: string, data: any) => void;
  clearOfflineQueue: (type: string) => void;
}

const usePWA = (): UsePWAReturn => {
  const [state, setState] = useState<PWAState>({
    isOnline: navigator.onLine,
    isInstalled: false,
    isUpdateAvailable: false,
    isInstallPromptAvailable: false,
    swRegistration: null,
    offlineQueue: [],
  });



  // Update app when new version is available
  const updateApp = useCallback(async () => {
    if (state.swRegistration && state.swRegistration.waiting) {
      // Tell the waiting service worker to skip waiting
      state.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // Listen for the controlling service worker change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }, [state.swRegistration]);

  // Skip waiting for service worker update
  const skipWaiting = useCallback(() => {
    if (state.swRegistration && state.swRegistration.waiting) {
      state.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [state.swRegistration]);

  // Register for push notifications
  const registerForPushNotifications = useCallback(async (): Promise<PushSubscription | null> => {
    if (!state.swRegistration) {
      console.error('Service worker not registered');
      return null;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return null;
      }

      // Subscribe to push notifications
      const subscription = await state.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.REACT_APP_VAPID_PUBLIC_KEY || ''
        ),
      });

      // Send subscription to server
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(subscription),
      });

      return subscription;
    } catch (error) {
      console.error('Push notification registration failed:', error);
      return null;
    }
  }, [state.swRegistration]);

  // Unregister push notifications
  const unregisterPushNotifications = useCallback(async (): Promise<boolean> => {
    if (!state.swRegistration) {
      return false;
    }

    try {
      const subscription = await state.swRegistration.pushManager.getSubscription();
      if (subscription) {
        // Unsubscribe from push notifications
        await subscription.unsubscribe();
        
        // Notify server
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      return true;
    } catch (error) {
      console.error('Push notification unregistration failed:', error);
      return false;
    }
  }, [state.swRegistration]);

  // Add data to offline queue
  const addToOfflineQueue = useCallback((type: string, data: any) => {
    const item = {
      id: Date.now().toString(),
      type,
      data,
      timestamp: Date.now(),
      retries: 0
    };
    
    setState(prev => ({
      ...prev,
      offlineQueue: [...prev.offlineQueue, item]
    }));

    // Background sync is not universally supported, so we'll handle sync manually
    console.log('Added to offline queue:', type, data);
  }, []);

  // Clear offline queue
  const clearOfflineQueue = useCallback((type: string) => {
    try {
      const queueKey = `offline_queue_${type}`;
      localStorage.removeItem(queueKey);
    } catch (error) {
      console.error('Failed to clear offline queue:', error);
    }
  }, []);

  // Initialize PWA features
  useEffect(() => {
    // Check if installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isInstalled = isStandalone || isIOSStandalone;
    setState(prev => ({ ...prev, isInstalled }));

    // Register service worker
    const initServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          
          setState(prev => ({ ...prev, swRegistration: registration }));

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setState(prev => ({ ...prev, isUpdateAvailable: true }));
                }
              });
            }
          });

          // Listen for messages from service worker
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'SW_UPDATE_AVAILABLE') {
              setState(prev => ({ ...prev, isUpdateAvailable: true }));
            }
          });
        } catch (error) {
          console.error('Service worker registration failed:', error);
        }
      }
    };

    initServiceWorker();

    // Listen for online/offline events
    const handleOnline = () => setState(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setState(prev => ({ ...prev, isInstallPromptAvailable: true }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    const handleAppInstalled = () => {
      setState(prev => ({ 
        ...prev, 
        isInstalled: true, 
        isInstallPromptAvailable: false 
      }));
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return {
    ...state,
    updateApp,
    skipWaiting,
    registerForPushNotifications,
    unregisterPushNotifications,
    addToOfflineQueue,
    clearOfflineQueue,
  };
};

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default usePWA;