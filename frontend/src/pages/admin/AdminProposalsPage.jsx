import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { adminProposalService, excelService } from '../../services/api';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';

const AdminProposalsPage = () => {
  const { token } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const loadProposals = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filter) params.append('status', filter);
      const res = await adminProposalService.getAllWithParams(params.toString(), token);
      if (res.success) {
        setProposals(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách đề xuất');
    } finally {
      setLoading(false);
    }
  }, [filter, token]);

  useEffect(() => { loadProposals(1); }, [loadProposals]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const res = await adminProposalService.updateStatus(id, newStatus, token);
      if (res.success) {
        setToast({ message: 'Cập nhật trạng thái thành công', type: 'success' });
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Cập nhật thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null });
    try {
      const res = await adminProposalService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa đề xuất thành công', type: 'success' });
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleExportProposals = async () => {
    try {
      await excelService.exportProposals(token);
      setToast({ message: 'Export proposals thành công', type: 'success' });
    } catch {
      setError('Lỗi export proposals');
    }
  };

  if (loading && proposals.length === 0) return <Loading message="Đang tải danh sách đề xuất..." />;

  return (
    <div className="admin-proposals-page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

      <div className="page-header">
        <h1>Quản lý Đề xuất</h1>
        <div className="page-header-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
            <option value="">Tất cả</option>
            <option value="PENDING">PENDING</option>
            <option value="REVIEWING">REVIEWING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <button className="btn btn-secondary" onClick={handleExportProposals}>Export Excel</button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadProposals(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa đề xuất"
        message="Bạn có chắc chắn muốn xóa đề xuất này?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null })}
        confirmText="Xóa"
        type="danger"
      />

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>STT</th>
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
              <tr><td colSpan="7"><EmptyState icon="📋" title="Không có đề xuất nào" /></td></tr>
            ) : proposals.map((p, idx) => (
              <tr key={p.id}>
                <td>{(pagination.page - 1) * pagination.limit + idx + 1}</td>
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
                  <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(p.id)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadProposals}
      />
    </div>
  );
};

export default AdminProposalsPage;
