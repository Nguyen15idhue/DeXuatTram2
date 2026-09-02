import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardService } from '../../services/api';
import ErrorMessage from '../../components/ErrorMessage';
import { Users, Zap, ClipboardList } from 'lucide-react';

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

  const cards = [
    {
      title: 'Users',
      icon: Users,
      total: stats?.users?.total,
      detail: `Active: ${stats?.users?.active ?? 0} | Locked: ${stats?.users?.locked ?? 0}`,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Stations',
      icon: Zap,
      total: stats?.stations?.total,
      detail: `Active: ${stats?.stations?.active ?? 0} | Deploying: ${stats?.stations?.deploying ?? 0}`,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      title: 'Proposals',
      icon: ClipboardList,
      total: stats?.proposals?.total,
      detail: `Pending: ${stats?.proposals?.pending ?? 0} | Approved: ${stats?.proposals?.approved ?? 0} | Rejected: ${stats?.proposals?.rejected ?? 0}`,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      {error && <ErrorMessage message={error} />}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.title} className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon size={20} className={card.color} />
                </div>
                <h3 className="card-title text-base">{card.title}</h3>
              </div>
              <p className="text-3xl font-bold">
                {loading ? (
                  <span className="loading loading-dots loading-sm"></span>
                ) : (
                  card.total ?? '-'
                )}
              </p>
              {!loading && (
                <p className="text-sm text-base-content/60 mt-1">{card.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
