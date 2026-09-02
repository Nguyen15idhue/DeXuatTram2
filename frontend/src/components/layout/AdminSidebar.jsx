import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart3, Users, Zap, ClipboardList, Settings,
  FileText, File, LayoutGrid, List, Map, MapPin, LogOut
} from 'lucide-react';

const menuItems = [
  { path: '/admin', label: 'Dashboard', icon: BarChart3 },
  { path: '/admin/users', label: 'Quản lý Users', icon: Users },
  { path: '/admin/stations', label: 'Quản lý Trạm', icon: Zap },
  { path: '/admin/proposals', label: 'Quản lý Đề xuất', icon: ClipboardList },
  { divider: true },
  { label: 'Cấu hình', icon: Settings, isGroup: true },
  { path: '/admin/fields', label: 'Field Definitions', icon: FileText },
  { path: '/admin/forms', label: 'Forms Manager', icon: File },
  { path: '/admin/views', label: 'Views Manager', icon: LayoutGrid },
  { path: '/admin/data-lists', label: 'Data Lists', icon: List },
  { path: '/admin/map-config', label: 'Map Config', icon: Map },
];

const AdminSidebar = ({ onNavClick }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <aside className="bg-neutral text-neutral-content w-64 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex-shrink-0">
        <Link to="/admin" className="text-xl font-bold text-white" onClick={onNavClick}>
          Admin Panel
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {menuItems.map((item, idx) => {
          if (item.divider) {
            return <div key={`divider-${idx}`} className="border-t border-white/10 my-2 mx-3" />;
          }
          if (item.isGroup) {
            return (
              <div key={item.label} className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-white/40 font-semibold flex items-center gap-2">
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
              onClick={onNavClick}
            >
              <item.icon size={18} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <div className="border-t border-white/10 my-2 mx-3" />
        <Link
          to="/map"
          className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          onClick={onNavClick}
        >
          <MapPin size={18} />
          <span className="truncate">Xem bản đồ</span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
            {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.full_name}</div>
            <div className="text-xs text-white/50">{user?.role}</div>
          </div>
        </div>
        <button onClick={logout} className="btn btn-sm btn-ghost text-white/70 hover:text-white hover:bg-white/10 w-full gap-2 justify-start">
          <LogOut size={14} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
