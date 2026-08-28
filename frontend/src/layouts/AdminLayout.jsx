import { useState } from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AdminLayout = () => {
  const { user, isAuthenticated, isAdmin, loading, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return <div className="loading">Đang tải...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/map" replace />;
  }

  const menuItems = [
    { path: '/admin', label: 'Dashboard', icon: '📊' },
    { path: '/admin/users', label: 'Quản lý Users', icon: '👥' },
    { path: '/admin/stations', label: 'Quản lý Trạm', icon: '⚡' },
    { path: '/admin/proposals', label: 'Quản lý Đề xuất', icon: '📋' },
  ];

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  return (
    <div className={`admin-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link to="/admin" className="logo" onClick={handleNavClick}>Admin Panel</Link>
        </div>
        <nav className="sidebar-nav">
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
          <div className="sidebar-divider" />
          <Link
            to="/map"
            className="sidebar-nav-link-user"
            onClick={handleNavClick}
          >
            <span>🗺️</span> Xem bản đồ (User)
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user?.full_name}</span>
            <span className="user-role">{user?.role}</span>
          </div>
          <button onClick={logout} className="btn-logout">Đăng xuất</button>
        </div>
      </aside>
      <main className="main-content">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <span className="hamburger-icon">☰</span>
        </button>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
