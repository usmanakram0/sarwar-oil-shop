import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { SHOP_NAME } from '@/lib/shop';
import {
  LayoutDashboard,
  Package,
  Users,
  FileText,
  Settings,
  Menu,
  X,
  Droplets,
  BookOpen,
  Truck,
  PackagePlus,
  Tags,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import UserSidebarFooter from '@/components/layout/UserSidebarFooter';
import SyncStatusBanner from '@/components/sync/SyncStatusBanner';
import WeeklyBackupReminder from '@/components/backup/WeeklyBackupReminder';

const navItems = [
  { title: 'Dashboard', path: '/', icon: LayoutDashboard },
  { title: 'Products', path: '/products', icon: Package },
  { title: 'Categories', path: '/categories', icon: Tags },
  { title: 'Stock In', path: '/stock-in', icon: PackagePlus },
  { title: 'Suppliers', path: '/suppliers', icon: Truck },
  { title: 'Customers', path: '/customers', icon: Users },
  { title: 'Invoices', path: '/invoices', icon: FileText },
  { title: 'Ledger', path: '/ledger', icon: BookOpen },
  { title: 'Settings', path: '/settings', icon: Settings },
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {

    if (path === '/') return location.pathname === '/';

    return location.pathname.startsWith(path);

  };



  return (

    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex bg-background">

      {/* Desktop Sidebar */}

      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-sidebar-border lg:h-screen lg:shrink-0 lg:sticky lg:top-0">

        <div className="p-5 flex items-center gap-3 border-b border-sidebar-border shrink-0">

          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center shadow-lg shadow-primary/20">

            <Droplets className="w-5 h-5 text-sidebar-primary-foreground" />

          </div>

          <span className="font-heading font-bold text-lg text-sidebar-foreground truncate">{SHOP_NAME}</span>

        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">

          {navItems.map((item) => (

            <Link

              key={item.path}

              to={item.path}

              className={cn(

                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',

                isActive(item.path)

                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20'

                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'

              )}

            >

              <item.icon className="w-5 h-5" />

              {item.title}

            </Link>

          ))}

        </nav>

        <UserSidebarFooter />

      </aside>



      {/* Mobile Overlay */}

      {sidebarOpen && (

        <div className="fixed inset-0 z-40 lg:hidden">

          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />

          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar animate-slide-in flex flex-col">

            <div className="p-5 flex items-center justify-between border-b border-sidebar-border shrink-0">

              <div className="flex items-center gap-3">

                <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">

                  <Droplets className="w-5 h-5 text-sidebar-primary-foreground" />

                </div>

                <span className="font-heading font-bold text-lg text-sidebar-foreground truncate">{SHOP_NAME}</span>

              </div>

              <button onClick={() => setSidebarOpen(false)} className="text-sidebar-foreground">

                <X className="w-5 h-5" />

              </button>

            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">

              {navItems.map((item) => (

                <Link

                  key={item.path}

                  to={item.path}

                  onClick={() => setSidebarOpen(false)}

                  className={cn(

                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',

                    isActive(item.path)

                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'

                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'

                  )}

                >

                  <item.icon className="w-5 h-5" />

                  {item.title}

                </Link>

              ))}

            </nav>

            <UserSidebarFooter onNavigate={() => setSidebarOpen(false)} />

          </aside>

        </div>

      )}



      {/* Main Content */}

      <div className="flex-1 flex flex-col min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden">

        {/* Top Bar */}

        <header className="h-14 shrink-0 border-b flex items-center px-4 lg:px-6 gap-4 bg-card/80 backdrop-blur-sm no-print sticky top-0 z-20">

          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>

            <Menu className="w-5 h-5 text-foreground" />

          </button>

          <div className="flex-1" />

          <span className="text-sm text-muted-foreground font-body">

            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

          </span>

        </header>



        <SyncStatusBanner />

        <WeeklyBackupReminder />



        <main className="flex-1 min-h-0 p-4 lg:p-6 overflow-y-auto">

          <Outlet />

        </main>

      </div>



      {/* Mobile Bottom Nav */}

      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t flex lg:hidden z-30 no-print">

        {navItems.filter(i => ['/','/products','/stock-in','/invoices','/customers'].includes(i.path)).map((item) => (

          <Link

            key={item.path}

            to={item.path}

            className={cn(

              'flex-1 flex flex-col items-center py-2 text-xs transition-colors',

              isActive(item.path) ? 'text-primary' : 'text-muted-foreground'

            )}

          >

            <item.icon className="w-5 h-5 mb-0.5" />

            {item.title}

          </Link>

        ))}

      </nav>

    </div>

  );

}



