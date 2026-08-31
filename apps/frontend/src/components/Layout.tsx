import React, { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/auth.store';

interface LayoutProps {
  children: ReactNode;
}

export const MainLayout: React.FC<LayoutProps> = ({ children }) => {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems = [
    { label: '🏠 Dashboard', href: '/dashboard' },
    { label: '📦 Purchase Orders', href: '/pos' },
    { label: '📅 Appointments', href: '/appointments' },
    { label: '🚚 Dispatch', href: '/dispatch' },
    { label: '📍 Logistics', href: '/logistics' },
    { label: '📋 GRN', href: '/grn' },
    { label: '↩ Returns', href: '/returns' },
    { label: '✅ My Tasks', href: '/tasks' },
    { label: '📊 Reports', href: '/reports' },
    { label: '⚙ Settings', href: '/settings' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-gray-800">PO Control Tower</h1>
          <p className="text-sm text-gray-500 mt-1">Flow Management</p>
        </div>

        <nav className="mt-6 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-6 py-3 transition-colors ${
                router.pathname === item.href
                  ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">{getPageTitle(router.pathname)}</h2>
            <div className="flex items-center gap-4">
              <button className="relative">
                <span className="text-2xl">🔔</span>
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  3
                </span>
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{user?.name || 'User'}</span>
                <button
                  onClick={handleLogout}
                  className="ml-2 px-3 py-1 bg-red-50 text-red-600 rounded text-sm hover:bg-red-100"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
};

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/pos': 'Purchase Orders',
    '/appointments': 'Appointments',
    '/dispatch': 'Dispatch',
    '/logistics': 'Logistics',
    '/grn': 'GRN',
    '/returns': 'Returns',
    '/tasks': 'My Tasks',
    '/reports': 'Reports',
    '/settings': 'Settings',
  };
  return titles[pathname] || 'Page';
}
