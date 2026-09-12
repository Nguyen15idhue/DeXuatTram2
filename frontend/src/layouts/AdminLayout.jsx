import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AdminSidebar from '../components/layout/AdminSidebar';
import AdminHeader from '../components/layout/AdminHeader';
import Toast from '../components/Toast';
import useMediaQuery from '../hooks/useMediaQuery';

const AdminLayout = () => {
  const { isAuthenticated, canAccessPanel, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [toast, setToast] = useState({ message: '', type: 'error' });
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.denied) {
      setToast({ message: 'Không có quyền truy cập', type: 'error' });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (toast.message) {
      const t = setTimeout(() => setToast({ message: '', type: 'error' }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast.message]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-base-content">Đang tải...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessPanel) {
    return <Navigate to="/map" replace />;
  }

  const handleNavClick = () => setSidebarOpen(false);

  return (
    <div className="drawer lg:drawer-open">
      <input
        type="checkbox"
        className="drawer-toggle"
        checked={sidebarOpen}
        onChange={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Content */}
      <div className="drawer-content flex flex-col min-h-screen">
        <AdminHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} showBell={!isDesktop} />
        <main className="flex-1 p-4 lg:p-6 bg-base-200">
          <Outlet />
        </main>
      </div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'error' })} duration={3000} />

      {/* Sidebar */}
      <div className="drawer-side z-40 h-screen">
        <label className="drawer-overlay" onClick={() => setSidebarOpen(false)} />
        <AdminSidebar onNavClick={handleNavClick} showBell={isDesktop} />
      </div>
    </div>
  );
};

export default AdminLayout;
