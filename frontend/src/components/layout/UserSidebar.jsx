import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Map, ClipboardList, User, Settings, LogOut, X } from 'lucide-react';

const menuItems = [
  { path: '/map', label: 'Bản đồ', icon: Map },
  { path: '/my-proposals', label: 'Đề xuất của tôi', icon: ClipboardList },
  { path: '/profile', label: 'Hồ sơ', icon: User },
];

const UserSidebar = ({ isOpen, onClose }) => {
  const { user, isAdmin, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/map') return location.pathname === '/map';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-base-100 shadow-lg z-50 transform transition-transform duration-300 lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Header */}
        <div className="p-4 border-b border-base-300 flex justify-between items-center">
          <span className="text-lg font-bold text-primary">Menu</span>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                isActive(item.path)
                  ? 'bg-primary text-white'
                  : 'text-base-content hover:bg-base-200'
              }`}
              onClick={onClose}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="border-t border-base-300 my-2"></div>
              <Link
                to="/admin"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-base-content hover:bg-base-200 transition-colors"
                onClick={onClose}
              >
                <Settings size={18} />
                Admin Panel
              </Link>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-base-300 bg-base-100">
          <div className="text-sm font-medium text-base-content mb-2">{user?.full_name}</div>
          <button onClick={logout} className="btn btn-sm btn-error btn-outline w-full gap-2">
            <LogOut size={14} />
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
};

export default UserSidebar;
