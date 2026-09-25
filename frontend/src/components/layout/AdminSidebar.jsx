import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import {
  BarChart3, Users, Zap, ClipboardList, Settings,
  FileText, File, LayoutGrid, List, Map, MapPin, LogOut, ShieldCheck, History, BookOpen, ChevronDown
} from 'lucide-react';
import NotificationBell from './NotificationBell';

const mainItems = [
  { path: '/admin', label: 'Dashboard', icon: BarChart3, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES'] },
  { path: '/admin/users', label: 'Quản lý Users', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES'] },
  { path: '/admin/stations', label: 'Quản lý Trạm', icon: Zap, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES'] },
  { path: '/admin/proposals', label: 'Quản lý Đề xuất', icon: ClipboardList, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES'] },
  { path: '/admin/audit-log', label: 'Audit Log', icon: History, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES'] },
];

const configGroups = [
  {
    id: 'fields',
    label: 'Trường thông tin',
    roles: ['SUPER_ADMIN'],
    items: [
      { path: '/admin/fields', label: 'Định nghĩa trường', icon: FileText, roles: ['SUPER_ADMIN'] },
      { path: '/admin/forms', label: 'Biểu mẫu nhập liệu', icon: File, roles: ['SUPER_ADMIN'] },
      { path: '/admin/views', label: 'Cấu hình bảng', icon: LayoutGrid, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    id: 'data',
    label: 'Dữ liệu',
    roles: ['SUPER_ADMIN'],
    items: [
      { path: '/admin/data-lists', label: 'Danh mục dữ liệu', icon: List, roles: ['SUPER_ADMIN'] },
      { path: '/admin/map-config', label: 'Cấu hình bản đồ', icon: Map, roles: ['SUPER_ADMIN'] },
      { path: '/admin/help', label: 'Quản lý hướng dẫn', icon: BookOpen, roles: ['SUPER_ADMIN'] },
      { path: '/admin/api-configs', label: 'Kết nối API', icon: Settings, roles: ['SUPER_ADMIN'] },
      { path: '/admin/documents', label: 'Quản lý tài liệu', icon: FileText, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    id: 'perms',
    label: 'Phân quyền',
    roles: ['SUPER_ADMIN'],
    items: [
      { path: '/admin/roles', label: 'Phân quyền', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
    ],
  },
];

const STORAGE_KEY = 'admin-sidebar-groups';

const loadCollapsed = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const saveCollapsed = (arr) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}
};

const isItemActive = (pathname, path) => pathname === path || (path !== '/admin' && pathname.startsWith(path));

const AdminSidebar = ({ onNavClick, showBell = true }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  useEffect(() => {
    setCollapsed((prev) => {
      const next = prev.filter((id) => {
        const g = configGroups.find((x) => x.id === id);
        if (!g) return false;
        return !g.items.some((it) => isItemActive(location.pathname, it.path));
      });
      if (next.length !== prev.length) {
        saveCollapsed(next);
        return next;
      }
      return prev;
    });
  }, [location.pathname]);

  const toggleGroup = (id) => {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveCollapsed(next);
      return next;
    });
  };

  const visibleMain = mainItems.filter((item) => !item.roles || item.roles.includes(user?.role));
  const visibleGroups = configGroups
    .filter((g) => !g.roles || g.roles.includes(user?.role))
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.roles || it.roles.includes(user?.role)) }))
    .filter((g) => g.items.length > 0);

  const linkClass = (isActive) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 ${
    isActive
      ? 'bg-primary text-primary-content shadow-sm'
      : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
  }`;

  const renderLink = (item) => {
    const isActive = isItemActive(location.pathname, item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        className={linkClass(isActive)}
        onClick={onNavClick}
      >
        <item.icon size={18} className={isActive ? 'text-primary-content' : ''} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="w-64 h-full flex flex-col bg-base-100 border-r border-base-300">
      {/* Header */}
      <div className="px-5 py-4 border-b border-base-300 flex-shrink-0 flex items-center justify-between">
        <Link to="/admin" className="text-lg font-bold text-primary" onClick={onNavClick}>
          Admin Panel
        </Link>
        {showBell && <NotificationBell mode="admin" />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        {visibleMain.map(renderLink)}
        {visibleGroups.length > 0 && <div className="border-t border-base-300 my-3 mx-1" />}
        {visibleGroups.map((g) => {
          const isCollapsed = collapsed.includes(g.id);
          return (
            <div key={g.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                className="w-full flex items-center justify-between px-2 pt-3 pb-2 text-xs font-semibold text-base-content/50 uppercase tracking-wider hover:text-base-content"
              >
                <span>{g.label}</span>
                <ChevronDown size={14} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>
              {!isCollapsed && g.items.map(renderLink)}
            </div>
          );
        })}
        <div className="border-t border-base-300 my-3 mx-1" />
        <Link
          to="/map"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-base-content/70 hover:bg-base-200 hover:text-base-content transition-all duration-150 hl-dash"
          onClick={onNavClick}
        >
          <MapPin size={18} />
          <span className="truncate">Xem bản đồ</span>
        </Link>
        <Link
          to="/admin/huong-dan"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${location.pathname === '/admin/huong-dan' ? 'bg-primary text-primary-content shadow-sm' : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}`}
          onClick={onNavClick}
        >
          <BookOpen size={18} />
          <span className="truncate">Hướng dẫn</span>
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
