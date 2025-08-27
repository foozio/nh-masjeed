import React, { useState, useEffect } from 'react';
import { RefreshCw, X, Download } from 'lucide-react';
import usePWA from '../hooks/usePWA';

interface UpdateNotificationProps {
  onUpdate?: () => void;
  onDismiss?: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onUpdate, onDismiss }) => {
  const { isUpdateAvailable, updateApp } = usePWA();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Reset dismissed state when new update becomes available
  useEffect(() => {
    if (isUpdateAvailable) {
      setIsDismissed(false);
    }
  }, [isUpdateAvailable]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateApp();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update app:', error);
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Don't show if no update available or dismissed
  if (!isUpdateAvailable || isDismissed) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg mr-3">
              <RefreshCw className={`h-5 w-5 text-blue-600 dark:text-blue-400 ${isUpdating ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                {isUpdating ? 'Memperbarui Aplikasi...' : 'Pembaruan Tersedia'}
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {isUpdating 
                  ? 'Mohon tunggu sementara kami memperbarui aplikasi'
                  : 'Versi baru aplikasi Masjeed siap untuk dipasang'
                }
              </p>
            </div>
          </div>
          
          {!isUpdating && (
            <button
              onClick={handleDismiss}
              className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors ml-2"
              aria-label="Tutup notifikasi pembaruan"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isUpdating && (
          <div className="mt-4 space-y-3">
            {showDetails && (
              <div className="bg-blue-100 dark:bg-blue-900/40 rounded-md p-3">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 text-xs mb-2">
                  Yang Baru:
                </h4>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Peningkatan performa</li>
                  <li>• Perbaikan bug dan peningkatan stabilitas</li>
                  <li>• Pembaruan perhitungan waktu sholat</li>
                  <li>• Peningkatan fungsi offline</li>
                </ul>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
              >
                {showDetails ? 'Sembunyikan Detail' : 'Apa yang Baru?'}
              </button>
              
              <div className="flex space-x-2">
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                >
                  Nanti
                </button>
                <button
                  onClick={handleUpdate}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Perbarui Sekarang
                </button>
              </div>
            </div>
          </div>
        )}

        {isUpdating && (
          <div className="mt-4">
            <div className="bg-blue-100 dark:bg-blue-900/40 rounded-md p-3">
              <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 mb-2">
                <span>Memperbarui...</span>
                <span>Jangan tutup aplikasi</span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                <div className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full animate-pulse" style={{ width: '70%' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateNotification;