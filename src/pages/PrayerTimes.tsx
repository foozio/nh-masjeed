import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Bell, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import useAuthStore from '../store/authStore';
import CachedDataDisplay from '../components/CachedDataDisplay';
import OfflineActionButton from '../components/OfflineActionButton';
import { offlineStorage } from '../utils/indexedDB';

interface PrayerTime {
  id: string;
  prayer_date: string;
  fajr_time: string;
  sunrise_time?: string;
  dhuhr_time: string;
  asr_time: string;
  maghrib_time: string;
  isha_time: string;
  notes?: string;
  is_active: boolean;
}

const PrayerTimes: React.FC = () => {
  const { offline, token } = useAuthStore();
  const [prayerTimes, setPrayerTimes] = useState<PrayerTime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch prayer times
  const fetchPrayerTimes = async (useCache = false) => {
    try {
      setLoading(true);
      setError(null);

      if (useCache || !offline.isOnline) {
        // Try to get cached data first
        const cachedData = await offlineStorage.getPrayerTimes();
        if (cachedData) {
          setPrayerTimes(cachedData.data);
          setLastUpdated(cachedData.timestamp);
          if (!offline.isOnline) {
            setLoading(false);
            return;
          }
        }
      }

      if (offline.isOnline) {
        // Fetch from API
        const response = await fetch('/api/prayers/today', {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Gagal mengambil jadwal sholat');
        }

        const result = await response.json();
        if (result.success && result.data) {
          setPrayerTimes(result.data);
          setLastUpdated(Date.now());
          
          // Cache the data
          await offlineStorage.storePrayerTimes({
            data: result.data,
            timestamp: Date.now()
          });
        } else {
          throw new Error(result.error || 'Jadwal sholat tidak tersedia');
        }
      }
    } catch (err) {
      console.error('Error fetching prayer times:', err);
      setError(err instanceof Error ? err.message : 'Gagal memuat jadwal sholat');
      
      // Try to load cached data as fallback
      if (!prayerTimes) {
        const cachedData = await offlineStorage.getPrayerTimes();
        if (cachedData) {
          setPrayerTimes(cachedData.data);
          setLastUpdated(cachedData.timestamp);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Load prayer times on component mount
  useEffect(() => {
    fetchPrayerTimes();
  }, [offline.isOnline]);

  // Get next prayer time
  const getNextPrayer = () => {
    if (!prayerTimes) return null;

    const now = currentTime;
    const today = now.toISOString().split('T')[0];
    
    if (prayerTimes.prayer_date !== today) {
      return null; // Data is for a different day
    }

    const prayers = [
      { name: 'Subuh', time: prayerTimes.fajr_time },
      { name: 'Dzuhur', time: prayerTimes.dhuhr_time },
      { name: 'Ashar', time: prayerTimes.asr_time },
      { name: 'Maghrib', time: prayerTimes.maghrib_time },
      { name: 'Isya', time: prayerTimes.isha_time }
    ];

    const currentTimeStr = now.toTimeString().slice(0, 5);
    
    for (const prayer of prayers) {
      if (prayer.time > currentTimeStr) {
        return prayer;
      }
    }
    
    return null; // All prayers for today have passed
  };

  const nextPrayer = getNextPrayer();

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const handleRefresh = async () => {
    await fetchPrayerTimes();
  };

  if (loading && !prayerTimes) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Memuat jadwal sholat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 dark:bg-emerald-900 rounded-full mb-4">
            <Clock className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Jadwal Sholat
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <MapPin className="h-4 w-4" />
            <span>Jakarta, Indonesia</span>
            <span className="text-gray-400">•</span>
            <div className={`flex items-center gap-1 ${
              offline.isOnline ? 'text-green-600' : 'text-red-600'
            }`}>
              {offline.isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <span>{offline.isOnline ? 'Terhubung' : 'Tidak Terhubung'}</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && !prayerTimes && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-200 text-center">{error}</p>
          </div>
        )}

        {/* Next Prayer Highlight */}
        {nextPrayer && (
          <CachedDataDisplay
            dataType="sholat berikutnya"
            lastUpdated={lastUpdated || undefined}
            className="mb-6"
          >
            <div className="bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-6">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200 mb-2">
                  Sholat Berikutnya
                </h2>
                <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                  {nextPrayer.name}
                </div>
                <div className="text-xl text-emerald-700 dark:text-emerald-300">
                  {formatTime(nextPrayer.time)}
                </div>
              </div>
            </div>
          </CachedDataDisplay>
        )}

        {/* Prayer Times Table */}
        {prayerTimes ? (
          <CachedDataDisplay
            dataType="jadwal sholat"
            lastUpdated={lastUpdated || undefined}
            className="mb-6"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Jadwal Hari Ini
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {new Date(prayerTimes.prayer_date).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
              
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {[
                  { name: 'Subuh', time: prayerTimes.fajr_time, arabic: 'الفجر' },
                  { name: 'Terbit', time: prayerTimes.sunrise_time, arabic: 'الشروق' },
                  { name: 'Dzuhur', time: prayerTimes.dhuhr_time, arabic: 'الظهر' },
                  { name: 'Ashar', time: prayerTimes.asr_time, arabic: 'العصر' },
                  { name: 'Maghrib', time: prayerTimes.maghrib_time, arabic: 'المغرب' },
                  { name: 'Isya', time: prayerTimes.isha_time, arabic: 'العشاء' }
                ].filter(prayer => prayer.time).map((prayer, index) => (
                  <div key={index} className={`px-6 py-4 flex items-center justify-between ${
                    nextPrayer?.name === prayer.name ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                  }`}>
                    <div className="flex items-center space-x-4">
                      <div className={`w-2 h-2 rounded-full ${
                        nextPrayer?.name === prayer.name 
                          ? 'bg-emerald-500' 
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {prayer.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {prayer.arabic}
                        </div>
                      </div>
                    </div>
                    <div className={`text-lg font-mono ${
                      nextPrayer?.name === prayer.name
                        ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {formatTime(prayer.time!)}
                    </div>
                  </div>
                ))}
              </div>
              
              {prayerTimes.notes && (
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Catatan:</strong> {prayerTimes.notes}
                  </p>
                </div>
              )}
            </div>
          </CachedDataDisplay>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Jadwal Sholat Tidak Tersedia
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Tidak dapat memuat jadwal sholat. Silakan periksa koneksi Anda dan coba lagi.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center space-x-4">
          <OfflineActionButton
            onClick={handleRefresh}
            variant="secondary"
            className="flex items-center space-x-2"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Perbarui</span>
          </OfflineActionButton>
          
          <OfflineActionButton
            onClick={() => {
              // This would typically enable/disable prayer notifications
              alert('Fitur notifikasi sholat segera hadir!');
            }}
            variant="primary"
            className="flex items-center space-x-2"
            queueType="general"
          >
            <Bell className="h-4 w-4" />
            <span>Aktifkan Notifikasi</span>
          </OfflineActionButton>
        </div>
      </div>
    </div>
  );
};

export default PrayerTimes;