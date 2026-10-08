import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const RoleRoute = ({ allowed, children, redirectTo = '/admin' }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-base-content">Đang tải...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(user?.role)) {
    const state = redirectTo === '/admin' ? { denied: true, from: location.pathname } : undefined;
    return <Navigate to={redirectTo} replace state={state} />;
  }

  return children;
};

export default RoleRoute;
