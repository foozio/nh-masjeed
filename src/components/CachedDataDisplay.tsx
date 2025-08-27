import React, { ReactNode } from 'react';
import { CloudOff, Clock, AlertTriangle } from 'lucide-react';
import useAuthStore from '../store/authStore';

interface CachedDataDisplayProps {
  children: ReactNode;
  dataType: string;
  lastUpdated?: number;
  showOfflineIndicator?: boolean;
  className?: string;
}

const CachedDataDisplay: React.FC<CachedDataDisplayProps> = ({
  children,
  dataType,
  lastUpdated,
  showOfflineIndicator = true,
  className = ''
}) => {
  const { offline } = useAuthStore();

  const formatLastUpdated = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (minutes < 1) return 'Baru saja';
    if (minutes < 60) return `${minutes} menit lalu`;
    if (hours < 24) return `${hours} jam lalu`;
    if (days < 7) return `${days} hari lalu`;
    return new Date(timestamp).toLocaleDateString();
  };

  const isDataStale = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = diff / (1000 * 60 * 60);
    return hours > 24; // Consider data stale after 24 hours
  };

  return (
    <div className={`relative ${className}`}>
      {/* Offline Indicator Banner */}
      {!offline.isOnline && showOfflineIndicator && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-t-lg px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
            <CloudOff className="h-4 w-4" />
            <span>Menampilkan {dataType} tersimpan</span>
            {lastUpdated && (
              <>
                <span className="text-yellow-600 dark:text-yellow-400">•</span>
                <Clock className="h-3 w-3" />
                <span>Diperbarui {formatLastUpdated(lastUpdated)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stale Data Warning */}
      {lastUpdated && isDataStale(lastUpdated) && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-4 py-2 ${!offline.isOnline && showOfflineIndicator ? '' : 'rounded-t-lg'}">
          <div className="flex items-center gap-2 text-sm text-orange-800 dark:text-orange-200">
            <AlertTriangle className="h-4 w-4" />
            <span>{dataType} ini mungkin sudah usang</span>
            <span className="text-orange-600 dark:text-orange-400">•</span>
            <span>Terakhir diperbarui {formatLastUpdated(lastUpdated)}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={`${
        (!offline.isOnline && showOfflineIndicator) || (lastUpdated && isDataStale(lastUpdated))
          ? 'rounded-b-lg' 
          : 'rounded-lg'
      }`}>
        {children}
      </div>

      {/* Offline Overlay for Interactive Elements */}
      {!offline.isOnline && (
        <div className="absolute inset-0 bg-gray-900/5 dark:bg-gray-100/5 rounded-lg pointer-events-none" />
      )}
    </div>
  );
};

export default CachedDataDisplay;