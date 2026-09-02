import { useState } from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, Users, Zap, ClipboardList, Settings,
  FileText, File, LayoutGrid, List, Map, MapPin, Menu, X, LogOut
} from 'lucide-react';

const menuItems = [
  { path: '/admin', label: 'Dashboard', icon: BarChart3 },
  { path: '/admin/users', label: 'Quản lý Users', icon: Users },
  { path: '/admin/stations', label: 'Quản lý Trạm', icon: Zap },
  { path: '/admin/proposals', label: 'Quản lý Đề xuất', icon: ClipboardList },
  { divider: true },
  { label: 'Cấu hình', icon: Settings, isGroup: true },
  { path: '/admin/fields', label: 'Field Definitions', icon: FileText, parent: 'Cấu hình' },
  { path: '/admin/forms', label: 'Forms Manager', icon: File, parent: 'Cấu hình' },
  { path: '/admin/views', label: 'Views Manager', icon: LayoutGrid, parent: 'Cấu hình' },
  { path: '/admin/data-lists', label: 'Data Lists', icon: List, parent: 'Cấu hình' },
  { path: '/admin/map-config', label: 'Map Config', icon: Map, parent: 'Cấu hình' },
];

const AdminLayout = () => {
  const { user, isAuthenticated, isAdmin, loading, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-base-content">Đang tải...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/map" replace />;
  }

  const handleNavClick = () => setSidebarOpen(false);

  return (
    <div className="drawer lg:drawer-open">
      <input
        type="checkbox"
        className="drawer-toggle"
        checked={sidebarOpen}
        onChange={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Mobile header */}
      <div className="drawer-content flex flex-col">
        <div className="navbar bg-base-100 shadow-sm lg:hidden sticky top-0 z-30">
          <label className="btn btn-square btn-ghost drawer-button" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </label>
          <Link to="/admin" className="btn btn-ghost text-xl font-bold text-primary" onClick={handleNavClick}>
            Admin Panel
          </Link>
        </div>
        <main className="flex-1 p-4 lg:p-6 bg-base-200 min-h-screen">
          <Outlet />
        </main>
      </div>

      {/* Sidebar */}
      <div className="drawer-side z-40">
        <label className="drawer-overlay" onClick={() => setSidebarOpen(false)} />
        <aside className="bg-neutral text-neutral-content w-64 min-h-screen flex flex-col">
          {/* Sidebar header */}
          <div className="p-4 border-b border-white/10">
            <Link to="/admin" className="text-xl font-bold text-white" onClick={handleNavClick}>
              Admin Panel
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 overflow-y-auto">
            {menuItems.map((item, idx) => {
              if (item.divider) {
                return <div key={`divider-${idx}`} className="border-t border-white/10 my-2 mx-4" />;
              }
              if (item.isGroup) {
                return (
                  <div key={item.label} className="px-4 pt-4 pb-1 text-xs uppercase tracking-wider text-white/40 font-semibold flex items-center gap-2">
                    <item.icon size={14} />
                    {item.label}
                  </div>
                );
              }
              const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                  onClick={handleNavClick}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              );
            })}
            <div className="border-t border-white/10 my-2 mx-4" />
            <Link
              to="/map"
              className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              onClick={handleNavClick}
            >
              <MapPin size={18} />
              Xem bản đồ (User)
            </Link>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/10">
            <div className="mb-2">
              <div className="text-sm font-medium text-white">{user?.full_name}</div>
              <div className="text-xs text-white/50">{user?.role}</div>
            </div>
            <button onClick={logout} className="btn btn-sm btn-error btn-outline w-full gap-2">
              <LogOut size={14} />
              Đăng xuất
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdminLayout;
