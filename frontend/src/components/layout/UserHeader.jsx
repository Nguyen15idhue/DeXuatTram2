import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Map, ClipboardList, User, Settings, Menu, LogOut } from 'lucide-react';
import NotificationBell from './NotificationBell';

const navItems = [
  { path: '/map', label: 'Bản đồ', icon: Map },
  { path: '/my-proposals', label: 'Đề xuất của tôi', icon: ClipboardList },
  { path: '/profile', label: 'Hồ sơ', icon: User },
];

const UserHeader = ({ onMenuToggle }) => {
  const { canAccessPanel, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/map') return location.pathname === '/map';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <header className="navbar bg-base-100 shadow-sm sticky top-0 z-30 px-2 sm:px-4 lg:px-6 gap-1">
      <div className="navbar-start min-w-0">
        <label className="btn btn-square btn-ghost lg:hidden" onClick={onMenuToggle}>
          <Menu size={20} />
        </label>
        <Link to="/map" className="btn btn-ghost text-lg sm:text-xl font-bold text-primary px-1 sm:px-2 min-w-0">
          <span className="truncate">Station Management</span>
        </Link>
      </div>

      {/* Desktop nav */}
      <nav className="navbar-center hidden lg:flex gap-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`btn btn-ghost btn-sm gap-2 ${
              isActive(item.path) ? 'btn-active text-primary' : 'text-base-content/70'
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </Link>
        ))}
        {canAccessPanel && (
          <>
            <div className="divider divider-horizontal mx-1 h-6"></div>
            <Link
              to="/admin"
              className={`btn btn-ghost btn-sm gap-2 ${
                location.pathname === '/admin' || location.pathname.startsWith('/admin/') ? 'btn-active text-primary' : 'text-base-content/70'
              }`}
            >
              <Settings size={16} />
              Admin Panel
            </Link>
          </>
        )}
      </nav>

      <div className="navbar-end gap-1">
        <NotificationBell />
        <button onClick={logout} className="btn btn-sm btn-ghost text-error gap-1 hidden lg:inline-flex" title="Đăng xuất">
          <LogOut size={16} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </header>
  );
};

export default UserHeader;
