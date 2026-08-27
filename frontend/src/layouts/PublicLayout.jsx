import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const PublicLayout = () => {
  const { isAuthenticated, isAdmin } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin' : '/map'} replace />;
  }

  return (
    <div className="public-layout">
      <div className="public-container">
        <Outlet />
      </div>
    </div>
  );
};

export default PublicLayout;
