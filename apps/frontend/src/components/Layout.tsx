import React, { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/auth.store';
import { notificationsService } from '@/services/notifications.service';
import { Icon } from '@/components/Icon';
import { controlTowerService } from '@/services/control-tower.service';
import { CT_PLATFORMS, PlatformLogo, platformSlug } from '@/components/control-tower/brand';

interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface LayoutProps {
  children: ReactNode;
}

export const MainLayout: React.FC<LayoutProps> = ({ children }) => {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  useEffect(() => {
    if (!user) return;
    const refresh = () => notificationsService.unreadCount().then(setUnreadCount).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const openNotifications = async () => {
    setShowNotifications((v) => !v);
    if (!showNotifications) {
      const list = await notificationsService.list();
      setNotifications(list);
    }
  };

  const markAllRead = async () => {
    await notificationsService.markAllRead();
    setUnreadCount(0);
    setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
  };

  const isAdmin = user?.roles?.includes('ADMIN' as any) || user?.roles?.includes('SCM' as any);

  // Control Tower: overall + every platform, each with its logo and urgent badge (flags 1-6, all time).
  const [ctUrgent, setCtUrgent] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user) return;
    controlTowerService.summary({}).then((s) => {
      const m: Record<string, number> = { ALL: s.aggregate?.urgent || 0 };
      (s.platforms || []).forEach((p: any) => (m[p.platform] = p.urgentAllTime || 0));
      setCtUrgent(m);
    }).catch(() => {});
  }, [user]);
  const ctItems: NavItem[] = [
    { label: 'Overall tower', href: '/control-tower', icon: <span className="w-5 h-5 rounded-md bg-gradient-to-br from-ct-orange to-ct-yellow text-white text-[9px] font-bold flex items-center justify-center">CT</span>, badge: ctUrgent.ALL },
    ...CT_PLATFORMS.map((p) => ({ label: p, href: `/control-tower/${platformSlug(p)}`, icon: <PlatformLogo p={p} size={20} />, badge: ctUrgent[p] })),
  ];

  const navGroups: { title?: string; items: NavItem[] }[] = [
    { items: [
      { label: 'Dashboard', icon: <Icon name="home" size={17} />, href: '/dashboard' },
      { label: 'Dispatch & GRN', icon: <Icon name="truck" size={17} />, href: '/dispatch-dashboard' },
      { label: 'Power BI', icon: <Icon name="chart" size={17} />, href: '/powerbi' },
    ] },
    { title: 'Control Tower', items: ctItems },
    { title: 'Purchase Orders', items: [
      { label: 'All POs', icon: <Icon name="package" size={17} />, href: '/pos' },
      { label: 'Not Fulfilled', icon: <Icon name="ban" size={17} />, href: '/pos/not-fulfilled' },
      { label: 'Expired, not delivered', icon: <Icon name="clock" size={17} />, href: '/pos/expired-undelivered' },
      { label: 'Day-wise dispatch', icon: <Icon name="calendar" size={17} />, href: '/dispatch-date-report' },
      { label: 'PO Bin', icon: <Icon name="trash" size={17} />, href: '/pos/bin' },
      { label: 'My Tasks', icon: <Icon name="check" size={17} />, href: '/tasks' },
      { label: 'Exceptions', icon: <Icon name="alert" size={17} />, href: '/exceptions' },
    ] },
    { title: 'Import', items: [
      { label: 'Bulk PO upload', icon: <Icon name="upload" size={17} />, href: '/bulk-import' },
      { label: 'Compilation reports', icon: <Icon name="report" size={17} />, href: '/bulk-import/reports' },
      { label: 'Invoices (Excel / Vasy PDF)', icon: <Icon name="receipt" size={17} />, href: '/invoice-import' },
      { label: 'PRN upload', icon: <Icon name="file" size={17} />, href: '/prn-import' },
      { label: 'DN upload', icon: <Icon name="file" size={17} />, href: '/dn-import' },
      { label: 'Google Sheets sync', icon: <Icon name="sheet" size={17} />, href: '/sheets-import' },
      { label: 'GRN upload', icon: <Icon name="inbox" size={17} />, href: '/grn-import' },
      { label: 'Daily dispatch report', icon: <Icon name="clipboard" size={17} />, href: '/dispatch-report-import' },
    ] },
    { title: 'Compilation', items: [
      { label: 'New compilation', icon: <Icon name="plus" size={17} />, href: '/compilations/new' },
      { label: 'Saved compilations', icon: <Icon name="folder" size={17} />, href: '/compilations' },
    ] },
    { title: 'Operations', items: [
      { label: 'Field forms', icon: <Icon name="forms" size={17} />, href: '/field-forms' },
      { label: 'Appointments', icon: <Icon name="calendar" size={17} />, href: '/appointments' },
      { label: 'Dispatch', icon: <Icon name="truck" size={17} />, href: '/dispatch' },
      { label: 'Logistics', icon: <Icon name="pin" size={17} />, href: '/logistics' },
      { label: 'GRN', icon: <Icon name="clipboard" size={17} />, href: '/grn' },
      { label: 'Returns', icon: <Icon name="undo" size={17} />, href: '/returns' },
      { label: 'Inventory', icon: <Icon name="boxes" size={17} />, href: '/inventory' },
    ] },
    { title: 'PO Control', items: [
      { label: 'Stuck stock', icon: <Icon name="pause" size={17} />, href: '/stuck-stock' },
      { label: 'PO mapping', icon: <Icon name="link" size={17} />, href: '/po-mapping' },
    ] },
    { title: 'Reports', items: [{ label: 'Reports', icon: <Icon name="report" size={17} />, href: '/reports' }] },
    { title: 'Settings', items: [
      { label: 'Settings', icon: <Icon name="settings" size={17} />, href: '/settings' },
      ...(isAdmin
        ? [
            { label: 'Masters', icon: <Icon name="tag" size={17} />, href: '/masters' },
            { label: 'Locations & TAT', icon: <Icon name="pin" size={17} />, href: '/locations' },
            { label: 'Users', icon: <Icon name="users" size={17} />, href: '/users' },
          ]
        : []),
    ] },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 w-full max-w-full">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white shadow-lg sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 border-b">
          <img src="/logos/nootie.jpg" alt="nootie" className="h-12 w-auto -ml-1" />
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">PO Control Tower</p>
        </div>

        <nav className="mt-4 pb-6">
          {navGroups.map((group, gi) => (
            <div key={gi} className="mb-3">
              {group.title && (
                <p className="px-6 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{group.title}</p>
              )}
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-6 py-2 transition-colors ${
                    router.pathname === item.href || (item.href.startsWith('/control-tower/') && router.asPath.split('?')[0] === item.href)
                      ? 'bg-nootie-orange-light text-nootie-orange-dark border-r-4 border-nootie-orange'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 truncate">{item.label}</span>
                  {!!item.badge && <span className="text-[10px] min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full bg-red-600 text-white font-semibold">{item.badge}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">{getPageTitle(router.pathname)}</h2>
            <div className="flex items-center gap-4">
              <div className="relative">
                <button onClick={openNotifications} className="relative">
                  <Icon name="bell" size={22} className="text-gray-600" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border z-50 max-h-96 overflow-auto">
                    <div className="p-3 border-b flex items-center justify-between">
                      <span className="font-medium text-sm">Notifications</span>
                      <button onClick={markAllRead} className="text-xs text-nootie-orange-dark hover:underline">Mark all read</button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="p-4 text-sm text-gray-500">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`p-3 border-b text-sm ${n.isRead ? '' : 'bg-nootie-orange-light'}`}>
                          <p className="font-medium text-gray-800">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
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
        <main className="flex-1 min-w-0 overflow-x-auto">
          <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-6 min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
};

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/field-forms': 'Field Forms',
    '/pos': 'Purchase Orders',
    '/pos/bin': 'PO Bin',
    '/pos/not-fulfilled': 'Not Fulfilled',
    '/appointments': 'Appointments',
    '/dispatch': 'Dispatch',
    '/logistics': 'Logistics',
    '/grn': 'GRN',
    '/returns': 'Returns',
    '/tasks': 'My Tasks',
    '/reports': 'Reports',
    '/powerbi': 'Power BI Dashboard',
    '/dispatch-dashboard': 'Dispatch & GRN Dashboard',
    '/settings': 'Settings',
    '/masters': 'Master Data',
    '/users': 'Users',
    '/bulk-import': 'Bulk Import',
    '/bulk-import/reports': 'Compilation Reports',
    '/dispatch-date-report': 'Day-wise Dispatch Report',
    '/invoice-import': 'Invoice Bulk Upload',
    '/prn-import': 'Bulk PRN Upload',
    '/dn-import': 'Bulk DN Upload',
    '/grn-import': 'GRN Bulk Upload',
    '/sheets-import': 'Google Sheets Upload',
    '/dispatch-report-import': 'Daily Dispatch Report Upload',
    '/exceptions': 'Exceptions',
    '/locations': 'Location & TAT Master',
    '/compilations': 'Saved Compilations',
    '/compilations/new': 'Create Compilation',
    '/inventory': 'Inventory',
    '/stuck-stock': 'Stuck Stock',
    '/po-mapping': 'PO Mapping',
  };
  return titles[pathname] || 'Page';
}
