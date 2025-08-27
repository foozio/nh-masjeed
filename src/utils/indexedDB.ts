interface StoredData {
  id: string;
  data: any;
  timestamp: number;
  expiresAt?: number;
}

interface DBSchema {
  prayerTimes: StoredData;
  events: StoredData;
  announcements: StoredData;
  donations: StoredData;
  community: StoredData;
  userData: StoredData;
  offlineQueue: {
    id: string;
    url: string;
    method: string;
    body?: any;
    headers?: Record<string, string>;
    timestamp: number;
    retryCount: number;
  };
}

class IndexedDBManager {
  private dbName = 'masjeed-offline-db';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        if (!db.objectStoreNames.contains('prayerTimes')) {
          db.createObjectStore('prayerTimes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('announcements')) {
          db.createObjectStore('announcements', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('donations')) {
          db.createObjectStore('donations', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('community')) {
          db.createObjectStore('community', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offlineQueue')) {
          db.createObjectStore('offlineQueue', { keyPath: 'id' });
        }
      };
    });
  }

  async store<T extends keyof DBSchema>(
    storeName: T,
    data: DBSchema[T],
    ttlMinutes?: number
  ): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const dataWithExpiry = {
        ...data,
        timestamp: Date.now(),
        expiresAt: ttlMinutes ? Date.now() + (ttlMinutes * 60 * 1000) : undefined
      };

      const request = store.put(dataWithExpiry);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async get<T extends keyof DBSchema>(
    storeName: T,
    id: string
  ): Promise<DBSchema[T] | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Check if data has expired
        if (result.expiresAt && Date.now() > result.expiresAt) {
          this.delete(storeName, id);
          resolve(null);
          return;
        }

        resolve(result);
      };
    });
  }

  async getAll<T extends keyof DBSchema>(
    storeName: T
  ): Promise<DBSchema[T][]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result || [];
        const validResults = results.filter((item: any) => {
          if (item.expiresAt && Date.now() > item.expiresAt) {
            this.delete(storeName, item.id);
            return false;
          }
          return true;
        });
        resolve(validResults);
      };
    });
  }

  async delete<T extends keyof DBSchema>(
    storeName: T,
    id: string
  ): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear<T extends keyof DBSchema>(storeName: T): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Offline queue specific methods
  async addToOfflineQueue(
    url: string,
    method: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<void> {
    const queueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      method,
      body,
      headers,
      timestamp: Date.now(),
      retryCount: 0
    };

    await this.store('offlineQueue', queueItem);
  }

  async getOfflineQueue(): Promise<DBSchema['offlineQueue'][]> {
    return await this.getAll('offlineQueue');
  }

  async removeFromOfflineQueue(id: string): Promise<void> {
    await this.delete('offlineQueue', id);
  }

  async incrementRetryCount(id: string): Promise<void> {
    const item = await this.get('offlineQueue', id);
    if (item) {
      item.retryCount += 1;
      await this.store('offlineQueue', item);
    }
  }
}

// Singleton instance
export const indexedDBManager = new IndexedDBManager();

// Helper functions for specific data types
export const offlineStorage = {
  // Prayer times
  async storePrayerTimes(data: any): Promise<void> {
    await indexedDBManager.store('prayerTimes', {
      id: 'current',
      data,
      timestamp: Date.now()
    }, 24 * 60); // 24 hours TTL
  },

  async getPrayerTimes(): Promise<{ data: any; timestamp: number } | null> {
    const result = await indexedDBManager.get('prayerTimes', 'current');
    return result ? { data: result.data, timestamp: result.timestamp } : null;
  },

  // Events
  async storeEvents(data: any[]): Promise<void> {
    await indexedDBManager.store('events', {
      id: 'current',
      data,
      timestamp: Date.now()
    }, 60); // 1 hour TTL
  },

  async getEvents(): Promise<{ data: any[]; timestamp: number } | null> {
    const result = await indexedDBManager.get('events', 'current');
    return result ? { data: result.data, timestamp: result.timestamp } : null;
  },

  // Announcements
  async storeAnnouncements(data: any[]): Promise<void> {
    await indexedDBManager.store('announcements', {
      id: 'current',
      data,
      timestamp: Date.now()
    }, 30); // 30 minutes TTL
  },

  async getAnnouncements(): Promise<{ data: any[]; timestamp: number } | null> {
    const result = await indexedDBManager.get('announcements', 'current');
    return result ? { data: result.data, timestamp: result.timestamp } : null;
  },

  // Community directory
  async storeCommunity(data: any[]): Promise<void> {
    await indexedDBManager.store('community', {
      id: 'current',
      data,
      timestamp: Date.now()
    }, 120); // 2 hours TTL
  },

  async getCommunity(): Promise<{ data: any[]; timestamp: number } | null> {
    const result = await indexedDBManager.get('community', 'current');
    return result ? { data: result.data, timestamp: result.timestamp } : null;
  },

  // Donations
  async storeDonations(data: any[]): Promise<void> {
    await indexedDBManager.store('donations', {
      id: 'current',
      data,
      timestamp: Date.now()
    }, 60); // 1 hour TTL
  },

  async getDonations(): Promise<{ data: any[]; timestamp: number } | null> {
    const result = await indexedDBManager.get('donations', 'current');
    return result ? { data: result.data, timestamp: result.timestamp } : null;
  }
};