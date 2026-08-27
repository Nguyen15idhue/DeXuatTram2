import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { adminProposalService } from '../../services/api';

const AdminProposalsPage = () => {
  const { token } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProposals = async () => {
    try {
      setLoading(true);
      const res = await adminProposalService.getAll(filter || null, token);
      if (res.success) setProposals(res.data);
    } catch {
      setError('Lỗi tải danh sách đề xuất');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProposals(); }, [filter]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const res = await adminProposalService.updateStatus(id, newStatus, token);
      if (res.success) {
        setSuccess('Cập nhật trạng thái thành công');
        loadProposals();
      } else {
        setError(res.message || 'Cập nhật thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa đề xuất này?')) return;
    try {
      const res = await adminProposalService.delete(id, token);
      if (res.success) {
        setSuccess('Xóa đề xuất thành công');
        loadProposals();
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading) return <div className="loading">Đang tải...</div>;

  return (
    <div className="admin-proposals-page">
      <div className="page-header">
        <h1>Quản lý Đề xuất</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
          <option value="">Tất cả</option>
          <option value="PENDING">PENDING</option>
          <option value="REVIEWING">REVIEWING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Chủ MB</th>
              <th>SĐT</th>
              <th>Địa chỉ</th>
              <th>Người đề xuất</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {proposals.length === 0 ? (
              <tr><td colSpan="7" className="empty">Không có đề xuất nào</td></tr>
            ) : proposals.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.owner_name}</td>
                <td>{p.owner_phone}</td>
                <td>{p.address}</td>
                <td>{p.user_name}</td>
                <td>
                  <span className={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                </td>
                <td>
                  <select
                    value={p.status}
                    onChange={(e) => handleStatusChange(p.id, e.target.value)}
                    className="status-select"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="REVIEWING">REVIEWING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                  <button className="btn btn-sm btn-delete" onClick={() => handleDelete(p.id)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminProposalsPage;
