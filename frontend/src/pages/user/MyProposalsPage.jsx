import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { myProposalService } from '../../services/api';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';

const MyProposalsPage = () => {
  const { token } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    owner_name: '', owner_phone: '', address: '',
    area: '', land_type: '', description: ''
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const loadProposals = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filter) params.append('status', filter);
      const res = await myProposalService.getAllWithParams(params.toString(), token);
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

  const openEdit = (proposal) => {
    setEditingId(proposal.id);
    setForm({
      owner_name: proposal.owner_name,
      owner_phone: proposal.owner_phone,
      address: proposal.address,
      area: proposal.area || '',
      land_type: proposal.land_type || '',
      description: proposal.description || ''
    });
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.owner_name || !form.owner_phone || !form.address) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return;
    }

    try {
      const res = await myProposalService.update(editingId, form, token);
      if (res.success) {
        setToast({ message: 'Cập nhật đề xuất thành công', type: 'success' });
        setShowForm(false);
        loadProposals(pagination.page);
      } else {
        setError(res.message || 'Cập nhật thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading && proposals.length === 0) return <Loading message="Đang tải đề xuất..." />;

  return (
    <div className="proposals-page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

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

      {error && !showForm && <ErrorMessage message={error} onRetry={() => { setError(''); loadProposals(1); }} />}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Chỉnh sửa đề xuất</h2>
            {error && <ErrorMessage message={error} />}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Họ tên chủ mặt bằng *</label>
                <input type="text" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Số điện thoại *</label>
                <input type="text" value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Địa chỉ *</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Diện tích</label>
                  <input type="text" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="VD: 50m2" />
                </div>
                <div className="form-group">
                  <label>Loại mặt bằng</label>
                  <input type="text" value={form.land_type} onChange={(e) => setForm({ ...form, land_type: e.target.value })} placeholder="VD: Nhà riêng" />
                </div>
              </div>
              <div className="form-group">
                <label>Ghi chú</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="3" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Cập nhật</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Chủ MB</th>
              <th>SĐT</th>
              <th>Địa chỉ</th>
              <th>Diện tích</th>
              <th>Loại đất</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {proposals.length === 0 ? (
              <tr><td colSpan="9"><EmptyState icon="📋" title="Bạn chưa có đề xuất nào" description="Hãy click trên bản đồ để tạo đề xuất mới" /></td></tr>
            ) : proposals.map((p, idx) => (
              <tr key={p.id}>
                <td>{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td>{p.owner_name}</td>
                <td>{p.owner_phone}</td>
                <td>{p.address}</td>
                <td>{p.area || '-'}</td>
                <td>{p.land_type || '-'}</td>
                <td>
                  <span className={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                </td>
                <td>{new Date(p.created_at).toLocaleDateString('vi-VN')}</td>
                <td>
                  {p.status === 'PENDING' && (
                    <button className="btn btn-sm btn-edit" onClick={() => openEdit(p)}>Sửa</button>
                  )}
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

export default MyProposalsPage;
