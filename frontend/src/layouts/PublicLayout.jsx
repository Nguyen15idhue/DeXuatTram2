import { Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RouteFallback from '../components/RouteFallback';

const PublicLayout = () => {
  const { isAuthenticated, canAccessPanel } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={canAccessPanel ? '/admin' : '/map'} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
};

export default PublicLayout;
