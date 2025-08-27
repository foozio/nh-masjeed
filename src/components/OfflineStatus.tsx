import React from 'react';
import { Wifi, WifiOff, Clock, RefreshCw, Trash2 } from 'lucide-react';
import useAuthStore from '../store/authStore';

interface OfflineStatusProps {
  className?: string;
}

const OfflineStatus: React.FC<OfflineStatusProps> = ({ className = '' }) => {
  const { 
    offline, 
    syncOfflineData, 
    clearOfflineQueue 
  } = useAuthStore();

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const handleSync = async () => {
    if (offline.isOnline && !offline.syncInProgress) {
      await syncOfflineData();
    }
  };

  const handleClearQueue = async () => {
    if (confirm('Are you sure you want to clear all queued requests? This action cannot be undone.')) {
      await clearOfflineQueue();
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          {offline.isOnline ? (
            <Wifi className="h-5 w-5 text-green-500" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-500" />
          )}
          Connection Status
        </h3>
        
        <div className="flex items-center gap-2">
          {offline.isOnline && (
            <button
              onClick={handleSync}
              disabled={offline.syncInProgress}
              className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${offline.syncInProgress ? 'animate-spin' : ''}`} />
              {offline.syncInProgress ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
          
          {offline.queuedRequests > 0 && (
            <button
              onClick={handleClearQueue}
              className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Clear Queue
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Network Status:</span>
          <span className={`text-sm font-medium ${
            offline.isOnline 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-red-600 dark:text-red-400'
          }`}>
            {offline.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Queued Requests */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Queued Requests:</span>
          <span className={`text-sm font-medium ${
            offline.queuedRequests > 0 
              ? 'text-orange-600 dark:text-orange-400' 
              : 'text-gray-600 dark:text-gray-400'
          }`}>
            {offline.queuedRequests}
          </span>
        </div>

        {/* Last Sync */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Last Sync:</span>
          <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatLastSync(offline.lastSyncTime)}
          </span>
        </div>

        {/* Sync Status */}
        {offline.syncInProgress && (
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Synchronizing data...
          </div>
        )}

        {/* Offline Message */}
        {!offline.isOnline && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              You're currently offline. Any actions you take will be queued and synchronized when you're back online.
            </p>
          </div>
        )}

        {/* Queue Info */}
        {offline.queuedRequests > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md p-3">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              You have {offline.queuedRequests} pending request{offline.queuedRequests !== 1 ? 's' : ''} that will be processed when you're back online.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfflineStatus;