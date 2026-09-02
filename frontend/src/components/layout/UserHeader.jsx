import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Map, ClipboardList, User, Settings, Menu, LogOut } from 'lucide-react';

const navItems = [
  { path: '/map', label: 'Bản đồ', icon: Map },
  { path: '/my-proposals', label: 'Đề xuất của tôi', icon: ClipboardList },
  { path: '/profile', label: 'Hồ sơ', icon: User },
];

const UserHeader = ({ onMenuToggle }) => {
  const { user, isAdmin, logout } = useAuth();

  return (
    <header className="navbar bg-base-100 shadow-sm sticky top-0 z-30 px-4 lg:px-6">
      <div className="navbar-start">
        <label className="btn btn-square btn-ghost lg:hidden" onClick={onMenuToggle}>
          <Menu size={20} />
        </label>
        <Link to="/map" className="btn btn-ghost text-xl font-bold text-primary">
          Station Management
        </Link>
      </div>

      {/* Desktop nav */}
      <nav className="navbar-center hidden lg:flex gap-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`btn btn-ghost btn-sm gap-2 ${
              location.pathname === item.path ? 'btn-active text-primary' : 'text-base-content/70'
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <>
            <div className="divider divider-horizontal mx-1 h-6"></div>
            <Link
              to="/admin"
              className={`btn btn-ghost btn-sm gap-2 ${
                location.pathname.startsWith('/admin') ? 'btn-active text-primary' : 'text-base-content/70'
              }`}
            >
              <Settings size={16} />
              Admin Panel
            </Link>
          </>
        )}
      </nav>

      <div className="navbar-end gap-2">
        <span className="text-sm text-base-content/70 hidden sm:inline">{user?.full_name}</span>
        <button onClick={logout} className="btn btn-sm btn-error btn-outline gap-2">
          <LogOut size={14} />
          <span className="hidden sm:inline">Đăng xuất</span>
        </button>
      </div>
    </header>
  );
};

export default UserHeader;
