import { indexedDBManager } from './indexedDB';

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body?: any;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
  maxRetries?: number;
  type: 'donations' | 'registrations' | 'announcements' | 'general';
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

class OfflineQueueManager {
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2
  };

  private isOnline = navigator.onLine;
  private retryTimeouts = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.setupNetworkListeners();
    this.initializeRetryProcess();
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('Network back online, processing queue...');
      this.isOnline = true;
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      console.log('Network offline, queuing requests...');
      this.isOnline = false;
    });
  }

  private async initializeRetryProcess(): Promise<void> {
    // Process any existing queue items on startup
    if (this.isOnline) {
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  async addToQueue(
    url: string,
    method: string,
    body?: any,
    headers?: Record<string, string>,
    type: QueuedRequest['type'] = 'general',
    retryConfig?: Partial<RetryConfig>
  ): Promise<string> {
    const config = { ...this.defaultRetryConfig, ...retryConfig };
    
    const queueItem: QueuedRequest = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: headers || {},
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: config.maxRetries,
      type
    };

    await indexedDBManager.store('offlineQueue', queueItem);
    console.log('Added request to offline queue:', queueItem.id);

    // If online, try to process immediately
    if (this.isOnline) {
      this.scheduleRetry(queueItem.id, 0);
    }

    return queueItem.id;
  }

  async processQueue(): Promise<void> {
    if (!this.isOnline) {
      console.log('Cannot process queue while offline');
      return;
    }

    try {
      const queueItems = await indexedDBManager.getAll('offlineQueue');
      console.log(`Processing ${queueItems.length} queued requests`);

      for (const item of queueItems) {
        await this.processQueueItem(item as QueuedRequest);
      }
    } catch (error) {
      console.error('Error processing offline queue:', error);
    }
  }

  private async processQueueItem(item: QueuedRequest): Promise<void> {
    try {
      const response = await this.executeRequest(item);
      
      if (response.ok) {
        console.log('Successfully processed queued request:', item.id);
        await this.removeFromQueue(item.id);
        this.notifySuccess(item);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to process queued request:', item.id, error);
      await this.handleRetry(item);
    }
  }

  private async executeRequest(item: QueuedRequest): Promise<Response> {
    const requestInit: RequestInit = {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        ...item.headers
      }
    };

    if (item.body && item.method !== 'GET') {
      requestInit.body = item.body;
    }

    return fetch(item.url, requestInit);
  }

  private async handleRetry(item: QueuedRequest): Promise<void> {
    const maxRetries = item.maxRetries || this.defaultRetryConfig.maxRetries;
    
    if (item.retryCount >= maxRetries) {
      console.log('Max retries reached for request:', item.id);
      await this.removeFromQueue(item.id);
      this.notifyFailure(item);
      return;
    }

    // Increment retry count
    item.retryCount += 1;
    await indexedDBManager.store('offlineQueue', item);

    // Schedule next retry with exponential backoff
    const delay = this.calculateRetryDelay(item.retryCount);
    this.scheduleRetry(item.id, delay);
  }

  private calculateRetryDelay(retryCount: number): number {
    const { baseDelay, maxDelay, backoffMultiplier } = this.defaultRetryConfig;
    const delay = baseDelay * Math.pow(backoffMultiplier, retryCount - 1);
    return Math.min(delay, maxDelay);
  }

  private scheduleRetry(itemId: string, delay: number): void {
    // Clear existing timeout if any
    const existingTimeout = this.retryTimeouts.get(itemId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        const item = await indexedDBManager.get('offlineQueue', itemId);
        if (item) {
          await this.processQueueItem(item as QueuedRequest);
        }
      } catch (error) {
        console.error('Error in scheduled retry:', error);
      } finally {
        this.retryTimeouts.delete(itemId);
      }
    }, delay);

    this.retryTimeouts.set(itemId, timeout);
    console.log(`Scheduled retry for ${itemId} in ${delay}ms`);
  }

  private async removeFromQueue(itemId: string): Promise<void> {
    await indexedDBManager.delete('offlineQueue', itemId);
    
    // Clear any pending retry timeout
    const timeout = this.retryTimeouts.get(itemId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(itemId);
    }
  }

  private notifySuccess(item: QueuedRequest): void {
    // Dispatch custom event for successful sync
    window.dispatchEvent(new CustomEvent('offlineQueueSuccess', {
      detail: {
        id: item.id,
        type: item.type,
        url: item.url,
        method: item.method
      }
    }));
  }

  private notifyFailure(item: QueuedRequest): void {
    // Dispatch custom event for failed sync
    window.dispatchEvent(new CustomEvent('offlineQueueFailure', {
      detail: {
        id: item.id,
        type: item.type,
        url: item.url,
        method: item.method,
        retryCount: item.retryCount
      }
    }));
  }

  async getQueueStatus(): Promise<{
    total: number;
    byType: Record<string, number>;
    items: QueuedRequest[];
  }> {
    const items = await indexedDBManager.getAll('offlineQueue') as QueuedRequest[];
    
    const byType = items.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: items.length,
      byType,
      items
    };
  }

  async clearQueue(): Promise<void> {
    // Clear all timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
    
    // Clear queue from IndexedDB
    await indexedDBManager.clear('offlineQueue');
    console.log('Offline queue cleared');
  }

  async removeQueueItem(itemId: string): Promise<void> {
    await this.removeFromQueue(itemId);
  }

  // Manual retry for specific item
  async retryItem(itemId: string): Promise<void> {
    const item = await indexedDBManager.get('offlineQueue', itemId);
    if (item && this.isOnline) {
      await this.processQueueItem(item as QueuedRequest);
    }
  }

  // Get network status
  getNetworkStatus(): boolean {
    return this.isOnline;
  }
}

// Singleton instance
export const offlineQueueManager = new OfflineQueueManager();

// Helper functions for common operations
export const offlineQueue = {
  // Add donation to queue
  async queueDonation(donationData: any, token: string): Promise<string> {
    return offlineQueueManager.addToQueue(
      '/api/donations',
      'POST',
      donationData,
      { 'Authorization': `Bearer ${token}` },
      'donations'
    );
  },

  // Add event registration to queue
  async queueEventRegistration(eventId: string, token: string): Promise<string> {
    return offlineQueueManager.addToQueue(
      `/api/events/${eventId}/register`,
      'POST',
      {},
      { 'Authorization': `Bearer ${token}` },
      'registrations'
    );
  },

  // Add announcement to queue
  async queueAnnouncement(announcementData: any, token: string): Promise<string> {
    return offlineQueueManager.addToQueue(
      '/api/announcements',
      'POST',
      announcementData,
      { 'Authorization': `Bearer ${token}` },
      'announcements'
    );
  },

  // Get queue status
  async getStatus() {
    return offlineQueueManager.getQueueStatus();
  },

  // Process queue manually
  async processQueue() {
    return offlineQueueManager.processQueue();
  },

  // Clear entire queue
  async clearQueue() {
    return offlineQueueManager.clearQueue();
  },

  // Check if online
  isOnline() {
    return offlineQueueManager.getNetworkStatus();
  }
};

// Event listeners for queue events
export function setupOfflineQueueListeners() {
  window.addEventListener('offlineQueueSuccess', (event: any) => {
    console.log('Offline queue item processed successfully:', event.detail);
    // You can add toast notifications or UI updates here
  });

  window.addEventListener('offlineQueueFailure', (event: any) => {
    console.error('Offline queue item failed permanently:', event.detail);
    // You can add error notifications or UI updates here
  });
}