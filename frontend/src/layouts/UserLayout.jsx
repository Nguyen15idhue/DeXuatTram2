import { useState, Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserHeader from '../components/layout/UserHeader';
import UserSidebar from '../components/layout/UserSidebar';
import RouteFallback from '../components/RouteFallback';

const UserLayout = () => {
  const { isAuthenticated, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-base-content">Đang tải...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-viewport flex flex-col bg-base-200 overflow-hidden">
      <UserHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <UserSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 overflow-y-auto min-h-0">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default UserLayout;
