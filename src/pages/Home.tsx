import { useState, useEffect } from 'react';
import { Building2, Clock, Calendar, Heart, Users, Bell, Wifi, WifiOff } from 'lucide-react';
import usePWA from '@/hooks/usePWA';

export default function Home() {
  const { isOnline, isInstalled } = usePWA();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const features = [
    {
      icon: Clock,
      title: 'Prayer Times',
      description: 'Accurate prayer schedules with notifications',
      color: 'text-emerald-600'
    },
    {
      icon: Calendar,
      title: 'Events',
      description: 'Kajian, Jumat prayers, and community events',
      color: 'text-blue-600'
    },
    {
      icon: Heart,
      title: 'Donations',
      description: 'Zakat, infaq, and sadaqah with QR codes',
      color: 'text-red-600'
    },
    {
      icon: Users,
      title: 'Community',
      description: 'Connect with fellow Muslims and volunteers',
      color: 'text-purple-600'
    },
    {
      icon: Bell,
      title: 'Announcements',
      description: 'Stay updated with mosque news and updates',
      color: 'text-orange-600'
    },
    {
      icon: isOnline ? Wifi : WifiOff,
      title: 'Offline Ready',
      description: 'Works without internet connection',
      color: isOnline ? 'text-green-600' : 'text-gray-600'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-emerald-100 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Building2 className="h-8 w-8 text-emerald-600" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Masjeed</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {currentTime.toLocaleTimeString('id-ID', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </div>
              <div className={`flex items-center space-x-1 text-sm ${
                isOnline ? 'text-green-600' : 'text-red-600'
              }`}>
                {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 dark:bg-emerald-900 rounded-full mb-6">
              <Building2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
              Assalamu'alaikum
            </h2>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8">
              Welcome to your Islamic Community App
            </p>
          </div>

          {/* PWA Status */}
          <div className="mb-12">
            <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
              isInstalled 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            }`}>
              {isInstalled ? (
                <>✓ App Installed - Ready to use offline!</>
              ) : (
                <>📱 Install this app for the best experience</>
              )}
            </div>
          </div>

          {/* Islamic Greeting */}
          <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-8 mb-12 border border-emerald-100 dark:border-gray-700">
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
              "Dan barangsiapa yang mengerjakan amal saleh, baik laki-laki maupun perempuan dalam keadaan beriman, 
              maka sesungguhnya akan Kami berikan kepadanya kehidupan yang baik."
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              - QS. An-Nahl: 97
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            App Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <div 
                  key={index}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-300 hover:scale-105"
                >
                  <div className="flex items-center mb-4">
                    <div className={`p-3 rounded-lg bg-gray-50 dark:bg-gray-700 ${feature.color}`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <h4 className="ml-4 text-lg font-semibold text-gray-900 dark:text-white">
                      {feature.title}
                    </h4>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-emerald-900 dark:bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-emerald-400 mr-3" />
            <span className="text-2xl font-bold">Masjeed</span>
          </div>
          <p className="text-emerald-200 mb-4">
            Connecting the Muslim community through technology
          </p>
          <p className="text-sm text-emerald-300">
            Built with ❤️ for the Ummah • Progressive Web App
          </p>
        </div>
      </footer>
    </div>
  );
}