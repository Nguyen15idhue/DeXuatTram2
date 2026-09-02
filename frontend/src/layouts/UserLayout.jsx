import { useState } from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Map, ClipboardList, User, Settings, Menu, LogOut } from 'lucide-react';

const menuItems = [
  { path: '/map', label: 'Bản đồ', icon: Map },
  { path: '/my-proposals', label: 'Đề xuất của tôi', icon: ClipboardList },
  { path: '/profile', label: 'Hồ sơ', icon: User },
];

const UserLayout = () => {
  const { user, isAuthenticated, isAdmin, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-base-content">Đang tải...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleNavClick = () => setMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-base-200">
      {/* Header */}
      <header className="navbar bg-base-100 shadow-sm sticky top-0 z-30 px-4">
        <div className="navbar-start">
          <label className="btn btn-square btn-ghost lg:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            <Menu size={20} />
          </label>
          <Link to="/map" className="btn btn-ghost text-xl font-bold text-primary" onClick={handleNavClick}>
            Station Management
          </Link>
        </div>

        {/* Desktop nav */}
        <nav className="navbar-center hidden lg:flex gap-1">
          {menuItems.map(item => (
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

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-base-100 shadow-lg">
            <div className="p-4 border-b border-base-300 flex justify-between items-center">
              <span className="text-lg font-bold text-primary">Menu</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <nav className="p-2">
              {menuItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    location.pathname === item.path
                      ? 'bg-primary text-white'
                      : 'text-base-content hover:bg-base-200'
                  }`}
                  onClick={handleNavClick}
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
                    onClick={handleNavClick}
                  >
                    <Settings size={18} />
                    Admin Panel
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default UserLayout;
