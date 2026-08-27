import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const UserLayout = () => {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const location = useLocation();

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

  return (
    <div className="user-layout">
      <header className="header">
        <div className="header-left">
          <Link to="/map" className="logo">Station Management</Link>
        </div>
        <nav className="nav">
          {menuItems.map(item => (
            <Link 
              key={item.path} 
              to={item.path}
              className={location.pathname === item.path ? 'active' : ''}
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
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
