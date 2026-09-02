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
  { label: 'Cấu hình', isGroup: true },
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
    <aside className="w-64 h-full flex flex-col bg-base-100 border-r border-base-300">
      {/* Header */}
      <div className="px-5 py-4 border-b border-base-300 flex-shrink-0">
        <Link to="/admin" className="text-lg font-bold text-primary" onClick={onNavClick}>
          Admin Panel
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        {menuItems.map((item, idx) => {
          if (item.divider) {
            return <div key={`divider-${idx}`} className="border-t border-base-300 my-3 mx-1" />;
          }
          if (item.isGroup) {
            return (
              <div key={item.label} className="px-2 pt-4 pb-2 text-xs font-semibold text-base-content/50 uppercase tracking-wider">
                {item.label}
              </div>
            );
          }
          const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 ${
                isActive
                  ? 'bg-primary text-primary-content shadow-sm'
                  : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
              }`}
              onClick={onNavClick}
            >
              <item.icon size={18} className={isActive ? 'text-primary-content' : ''} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <div className="border-t border-base-300 my-3 mx-1" />
        <Link
          to="/map"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-base-content/70 hover:bg-base-200 hover:text-base-content transition-all duration-150"
          onClick={onNavClick}
        >
          <MapPin size={18} />
          <span className="truncate">Xem bản đồ</span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-base-300 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
            {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-base-content truncate">{user?.full_name}</div>
            <div className="text-xs text-base-content/50 uppercase">{user?.role}</div>
          </div>
        </div>
        <button onClick={logout} className="btn btn-sm btn-ghost text-base-content/60 hover:text-error hover:bg-error/10 w-full gap-2 justify-start">
          <LogOut size={14} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
