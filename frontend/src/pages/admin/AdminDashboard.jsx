import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardService } from '../../services/api';
import ErrorMessage from '../../components/ErrorMessage';

const AdminDashboard = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const res = await dashboardService.getStats(token);
        if (res.success) {
          setStats(res.data);
        } else {
          setError(res.message || 'Lỗi tải thống kê');
        }
      } catch {
        setError('Lỗi kết nối server');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [token]);

  return (
    <div className="admin-dashboard">
      <h1>Dashboard</h1>
      {error && <ErrorMessage message={error} />}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Users</h3>
          <p className="stat-number">{loading ? '...' : (stats?.users?.total ?? '-')}</p>
          {!loading && <p className="stat-detail">Active: {stats?.users?.active ?? 0} | Locked: {stats?.users?.locked ?? 0}</p>}
        </div>
        <div className="stat-card">
          <h3>Stations</h3>
          <p className="stat-number">{loading ? '...' : (stats?.stations?.total ?? '-')}</p>
          {!loading && <p className="stat-detail">Active: {stats?.stations?.active ?? 0} | Deploying: {stats?.stations?.deploying ?? 0}</p>}
        </div>
        <div className="stat-card">
          <h3>Proposals</h3>
          <p className="stat-number">{loading ? '...' : (stats?.proposals?.total ?? '-')}</p>
          {!loading && <p className="stat-detail">Pending: {stats?.proposals?.pending ?? 0} | Approved: {stats?.proposals?.approved ?? 0} | Rejected: {stats?.proposals?.rejected ?? 0}</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
