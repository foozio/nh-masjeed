import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, Clock, AlertCircle } from 'lucide-react';
import usePWA from '../hooks/usePWA';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ 
  className = '', 
  showDetails = true 
}) => {
  const { isOnline } = usePWA();
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);
  const [offlineStartTime, setOfflineStartTime] = useState<Date | null>(null);
  const [offlineDuration, setOfflineDuration] = useState('');

  // Track offline duration
  useEffect(() => {
    if (!isOnline && !offlineStartTime) {
      setOfflineStartTime(new Date());
      setShowOfflineMessage(true);
    } else if (isOnline && offlineStartTime) {
      setOfflineStartTime(null);
      setOfflineDuration('');
      // Hide message after a brief "back online" notification
      setTimeout(() => setShowOfflineMessage(false), 3000);
    }
  }, [isOnline, offlineStartTime]);

  // Update offline duration
  useEffect(() => {
    if (!isOnline && offlineStartTime) {
      const interval = setInterval(() => {
        const now = new Date();
        const diff = now.getTime() - offlineStartTime.getTime();
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        if (minutes > 0) {
          setOfflineDuration(`${minutes}m ${seconds}s`);
        } else {
          setOfflineDuration(`${seconds}s`);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isOnline, offlineStartTime]);

  // Don't show if online and no message to display
  if (isOnline && !showOfflineMessage) {
    return null;
  }

  return (
    <div className={`${className}`}>
      {/* Compact indicator */}
      <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
        isOnline 
          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
          : 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800'
      }`}>
        {isOnline ? (
          <Wifi className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
        
        <span>
          {isOnline ? 'Back Online' : 'Offline'}
        </span>
        
        {!isOnline && offlineDuration && (
          <span className="text-xs opacity-75">
            ({offlineDuration})
          </span>
        )}
      </div>

      {/* Detailed offline message */}
      {!isOnline && showDetails && (
        <div className="mt-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium text-orange-900 dark:text-orange-100 text-sm mb-2">
                You're currently offline
              </h3>
              
              <div className="space-y-3">
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  Some features may be limited, but you can still access:
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center space-x-2 text-xs text-orange-700 dark:text-orange-300">
                    <Clock className="h-3 w-3" />
                    <span>Cached prayer times</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-orange-700 dark:text-orange-300">
                    <Clock className="h-3 w-3" />
                    <span>Saved events</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-orange-700 dark:text-orange-300">
                    <Clock className="h-3 w-3" />
                    <span>Downloaded announcements</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-orange-700 dark:text-orange-300">
                    <Clock className="h-3 w-3" />
                    <span>Community directory</span>
                  </div>
                </div>
                
                <div className="bg-orange-100 dark:bg-orange-900/20 rounded-md p-2 mt-3">
                  <p className="text-xs text-orange-800 dark:text-orange-200">
                    <strong>Note:</strong> Any actions you take (like donations or event registrations) 
                    will be saved and synced automatically when you're back online.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineIndicator;