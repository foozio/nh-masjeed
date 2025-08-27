import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useAuthStore from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: Array<'Admin' | 'Imam' | 'Pengurus' | 'Jamaah'>;
  fallbackPath?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRoles = [], 
  fallbackPath = '/login' 
}) => {
  const location = useLocation();
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    token, 
    refreshUser 
  } = useAuthStore();

  // Refresh user data if we have a token but no user data
  useEffect(() => {
    if (token && !user && !isLoading) {
      refreshUser();
    }
  }, [token, user, isLoading, refreshUser]);

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Memuat...
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Mohon tunggu sebentar
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <Navigate 
        to={fallbackPath} 
        state={{ from: location.pathname }} 
        replace 
      />
    );
  }

  // Check role-based access if required roles are specified
  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 py-8 px-6 shadow-xl rounded-lg text-center">
            <div className="mx-auto h-16 w-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Akses Ditolak
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Anda tidak memiliki izin untuk mengakses halaman ini.
            </p>
            <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
              <p>Role Anda: <span className="font-medium text-gray-700 dark:text-gray-300">{user.role}</span></p>
              <p>Role yang diperlukan: <span className="font-medium text-gray-700 dark:text-gray-300">{requiredRoles.join(', ')}</span></p>
            </div>
            <button
              onClick={() => window.history.back()}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render protected content
  return <>{children}</>;
};

export default ProtectedRoute;