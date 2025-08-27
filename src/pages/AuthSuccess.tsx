import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import useAuthStore from '../store/authStore';

const AuthSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, setError, error, isLoading } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const token = searchParams.get('token');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          setStatus('error');
          setMessage(decodeURIComponent(errorParam));
          setError(decodeURIComponent(errorParam));
          return;
        }

        if (!token) {
          setStatus('error');
          setMessage('Token tidak ditemukan dalam URL');
          setError('Token tidak ditemukan dalam URL');
          return;
        }

        // Use the login function from auth store
        await login(token);
        
        setStatus('success');
        setMessage('Login berhasil! Mengalihkan...');
        
        // Redirect to home page after successful login
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 2000);
        
      } catch (error) {
        console.error('Auth callback error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Terjadi kesalahan saat login');
      }
    };

    handleAuthCallback();
  }, [searchParams, login, navigate, setError]);

  const handleRetry = () => {
    navigate('/login', { replace: true });
  };

  const handleGoHome = () => {
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white dark:bg-gray-800 py-8 px-6 shadow-xl rounded-lg">
          <div className="text-center space-y-6">
            {/* Status Icon */}
            <div className="mx-auto flex items-center justify-center">
              {status === 'loading' && (
                <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                </div>
              )}
              {status === 'success' && (
                <div className="h-16 w-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              )}
              {status === 'error' && (
                <div className="h-16 w-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              )}
            </div>

            {/* Status Message */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {status === 'loading' && 'Memproses Login...'}
                {status === 'success' && 'Login Berhasil!'}
                {status === 'error' && 'Login Gagal'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {message || (status === 'loading' ? 'Mohon tunggu sebentar...' : '')}
              </p>
              {error && status === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  {error}
                </p>
              )}
            </div>

            {/* Loading Indicator */}
            {(status === 'loading' || isLoading) && (
              <div className="flex justify-center">
                <div className="animate-pulse flex space-x-1">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {status === 'success' && (
              <div className="space-y-3">
                <button
                  onClick={handleGoHome}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                >
                  Lanjut ke Beranda
                </button>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-3">
                <button
                  onClick={handleRetry}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                >
                  Coba Lagi
                </button>
                <button
                  onClick={handleGoHome}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                >
                  Kembali ke Beranda
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Help Text */}
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Jika mengalami masalah, silakan hubungi administrator masjid
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthSuccess;