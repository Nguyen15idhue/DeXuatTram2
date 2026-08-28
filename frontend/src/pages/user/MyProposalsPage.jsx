import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { myProposalService } from '../../services/api';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';

const MyProposalsPage = () => {
  const { token } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const loadProposals = async () => {
    try {
      setLoading(true);
      const res = await myProposalService.getAll(filter || null, token);
      if (res.success) setProposals(res.data);
    } catch {
      setError('Lỗi tải danh sách đề xuất');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProposals(); }, [filter]);

  if (loading) return <Loading message="Đang tải đề xuất..." />;

  return (
    <div className="proposals-page">
      <div className="page-header">
        <h1>Đề xuất của tôi</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
          <option value="">Tất cả</option>
          <option value="PENDING">PENDING</option>
          <option value="REVIEWING">REVIEWING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadProposals(); }} />}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Chủ MB</th>
              <th>SĐT</th>
              <th>Địa chỉ</th>
              <th>Diện tích</th>
              <th>Loại đất</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
            </tr>
          </thead>
          <tbody>
            {proposals.length === 0 ? (
              <tr><td colSpan="8"><EmptyState icon="📋" title="Bạn chưa có đề xuất nào" description="Hãy click trên bản đồ để tạo đề xuất mới" /></td></tr>
            ) : proposals.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.owner_name}</td>
                <td>{p.owner_phone}</td>
                <td>{p.address}</td>
                <td>{p.area || '-'}</td>
                <td>{p.land_type || '-'}</td>
                <td>
                  <span className={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                </td>
                <td>{new Date(p.created_at).toLocaleDateString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MyProposalsPage;
