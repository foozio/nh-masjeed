import React, { useState } from 'react';
import { Loader2, Wifi, WifiOff, Clock } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { offlineQueue } from '../utils/offlineQueue';

interface OfflineActionButtonProps {
  onClick: () => Promise<void> | void;
  onOfflineQueue?: (queueId: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  queueType?: 'donations' | 'registrations' | 'announcements' | 'general';
  requiresAuth?: boolean;
}

const OfflineActionButton: React.FC<OfflineActionButtonProps> = ({
  onClick,
  onOfflineQueue,
  children,
  className = '',
  disabled = false,
  variant = 'primary',
  size = 'md',
  queueType = 'general',
  requiresAuth = false
}) => {
  const { offline, token, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [queuedId, setQueuedId] = useState<string | null>(null);

  const getVariantClasses = () => {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    switch (variant) {
      case 'primary':
        return `${baseClasses} bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 disabled:bg-blue-300`;
      case 'secondary':
        return `${baseClasses} bg-gray-200 hover:bg-gray-300 text-gray-900 focus:ring-gray-500 disabled:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:disabled:bg-gray-800`;
      case 'danger':
        return `${baseClasses} bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 disabled:bg-red-300`;
      default:
        return `${baseClasses} bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 disabled:bg-blue-300`;
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-1.5 text-sm';
      case 'md':
        return 'px-4 py-2 text-sm';
      case 'lg':
        return 'px-6 py-3 text-base';
      default:
        return 'px-4 py-2 text-sm';
    }
  };

  const handleClick = async () => {
    if (disabled || isLoading) return;

    // Check authentication if required
    if (requiresAuth && !isAuthenticated) {
      alert('Please log in to perform this action.');
      return;
    }

    setIsLoading(true);

    try {
      if (offline.isOnline) {
        // Online: execute action directly
        await onClick();
      } else {
        // Offline: queue the action
        // Note: This is a simplified example. In a real implementation,
        // you would need to capture the actual API call details
        const queueId = await offlineQueue.queueDonation(
          { action: 'button_click', type: queueType },
          token || ''
        );
        
        setQueuedId(queueId);
        onOfflineQueue?.(queueId);
        
        // Show success message for queued action
        alert('Action queued! It will be processed when you\'re back online.');
      }
    } catch (error) {
      console.error('Action failed:', error);
      alert('Action failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = disabled || isLoading || (requiresAuth && !isAuthenticated);

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`${getVariantClasses()} ${getSizeClasses()} ${className} ${
        isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : !offline.isOnline ? (
          queuedId ? (
            <Clock className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )
        ) : (
          <Wifi className="h-4 w-4" />
        )}
        
        <span>
          {isLoading
            ? 'Processing...'
            : queuedId
            ? 'Queued'
            : !offline.isOnline
            ? `Queue ${children}`
            : children}
        </span>
      </div>
    </button>
  );
};

export default OfflineActionButton;