import React from 'react';
import Navigation from './Navigation';

interface LayoutProps {
  children: React.ReactNode;
  showNavigation?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, showNavigation = true }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {showNavigation && <Navigation />}
      <main className={showNavigation ? 'pt-16' : ''}>
        {children}
      </main>
    </div>
  );
};

export default Layout;