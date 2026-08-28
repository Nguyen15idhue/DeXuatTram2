import { useState } from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const UserLayout = () => {
  const { user, isAuthenticated, isAdmin, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return <div className="loading">Đang tải...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const menuItems = [
    { path: '/map', label: 'Bản đồ', icon: '🗺️' },
    { path: '/my-proposals', label: 'Đề xuất của tôi', icon: '📋' },
    { path: '/profile', label: 'Hồ sơ', icon: '👤' },
  ];

  const handleNavClick = () => {
    setMenuOpen(false);
  };

  return (
    <div className={`user-layout ${menuOpen ? 'menu-open' : ''}`}>
      {menuOpen && <div className="menu-overlay" onClick={() => setMenuOpen(false)} />}
      <header className="header">
        <div className="header-left">
          <button className="hamburger-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="hamburger-icon">☰</span>
          </button>
          <Link to="/map" className="logo" onClick={handleNavClick}>Station Management</Link>
        </div>
        <nav className={`nav ${menuOpen ? 'nav-open' : ''}`}>
          {menuItems.map(item => (
            <Link 
              key={item.path} 
              to={item.path}
              className={location.pathname === item.path ? 'active' : ''}
              onClick={handleNavClick}
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="nav-divider" />
              <Link
                to="/admin"
                className="nav-link-admin"
                onClick={handleNavClick}
              >
                <span>🔧</span> Admin Panel
              </Link>
            </>
          )}
        </nav>
        <div className="header-right">
          <span className="user-name">{user?.full_name}</span>
          <button onClick={logout} className="btn-logout">Đăng xuất</button>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default UserLayout;
