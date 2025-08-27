import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import AuthSuccess from './pages/AuthSuccess';
import PrayerTimes from './pages/PrayerTimes';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import UpdateNotification from './components/UpdateNotification';
import OfflineIndicator from './components/OfflineIndicator';
import useAuthStore from './store/authStore';
import { setupOfflineQueueListeners } from './utils/offlineQueue';

function App() {
  const { token, refreshUser, setOnlineStatus, updateQueuedRequests } = useAuthStore();

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }

    // Setup offline queue listeners
    setupOfflineQueueListeners();

    // Setup network status listeners
    const handleOnline = () => {
      console.log('Network back online');
      setOnlineStatus(true);
      updateQueuedRequests();
    };

    const handleOffline = () => {
      console.log('Network went offline');
      setOnlineStatus(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial network status
    setOnlineStatus(navigator.onLine);
    updateQueuedRequests();

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnlineStatus, updateQueuedRequests]);

  // Refresh user data on app load if token exists
  useEffect(() => {
    if (token) {
      refreshUser();
    }
  }, [token, refreshUser]);

  return (
    <Router>
      <div className="App min-h-screen bg-gray-50 dark:bg-gray-900">
        <PWAInstallPrompt />
        <UpdateNotification />
        <OfflineIndicator />
        
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/login" element={<Layout showNavigation={false}><Login /></Layout>} />
          <Route path="/auth/success" element={<Layout showNavigation={false}><AuthSuccess /></Layout>} />
          
          {/* Protected Routes */}
          <Route 
            path="/profile" 
            element={
              <Layout>
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              </Layout>
            } 
          />
          
          {/* Placeholder routes for future features */}
          <Route 
            path="/schedule" 
            element={
              <Layout>
                <PrayerTimes />
              </Layout>
            } 
          />
          
          <Route 
            path="/donations" 
            element={
              <Layout>
                <ProtectedRoute>
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Donasi & Infaq
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        Fitur ini akan segera hadir
                      </p>
                    </div>
                  </div>
                </ProtectedRoute>
              </Layout>
            } 
          />
          
          <Route 
            path="/announcements" 
            element={
              <Layout>
                <ProtectedRoute>
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Pengumuman Masjid
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        Fitur ini akan segera hadir
                      </p>
                    </div>
                  </div>
                </ProtectedRoute>
              </Layout>
            } 
          />
          
          <Route 
            path="/directory" 
            element={
              <Layout>
                <ProtectedRoute>
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Direktori Jamaah
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        Fitur ini akan segera hadir
                      </p>
                    </div>
                  </div>
                </ProtectedRoute>
              </Layout>
            } 
          />
          
          <Route 
            path="/settings" 
            element={
              <Layout>
                <ProtectedRoute>
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Pengaturan
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        Fitur ini akan segera hadir
                      </p>
                    </div>
                  </div>
                </ProtectedRoute>
              </Layout>
            } 
          />
          
          {/* 404 Route */}
          <Route 
            path="*" 
            element={
              <Layout>
                <div className="min-h-screen flex items-center justify-center">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Halaman Tidak Ditemukan
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Halaman yang Anda cari tidak tersedia
                    </p>
                  </div>
                </div>
              </Layout>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
