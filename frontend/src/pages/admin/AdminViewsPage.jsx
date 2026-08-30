import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { viewService } from '../../services/api';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';

const ENTITIES = ['stations', 'station_proposals', 'users'];

const AdminViewsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [filterEntity, setFilterEntity] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [newView, setNewView] = useState({ entity: 'stations', name: '', description: '' });

  const loadViews = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filterEntity) params.append('entity', filterEntity);
      const res = await viewService.getAll(params.toString(), token);
      if (res.success) {
        setViews(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách views');
    } finally {
      setLoading(false);
    }
  }, [filterEntity, token]);

  useEffect(() => { loadViews(1); }, [loadViews]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newView.name.trim()) { setError('Vui lòng nhập tên view'); return; }
    try {
      const res = await viewService.create(newView, token);
      if (res.success) {
        setToast({ message: 'Tạo view thành công', type: 'success' });
        setShowCreate(false);
        setNewView({ entity: 'stations', name: '', description: '' });
        navigate(`/admin/views/${res.data.id}/edit`);
      } else {
        setError(res.message || 'Tạo view thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id, name) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await viewService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa view thành công', type: 'success' });
        loadViews(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading && views.length === 0) return <Loading message="Đang tải danh sách views..." />;

  return (
    <div className="admin-views-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Views Manager</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Tạo view</button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadViews(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa view"
        message={`Bạn có chắc chắn muốn xóa view "${confirmDelete.name}"? Các field liên kết cũng sẽ bị xóa.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Tạo view mới</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Entity *</label>
                <select value={newView.entity} onChange={(e) => setNewView({ ...newView, entity: e.target.value })}>
                  {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tên view *</label>
                <input type="text" value={newView.name} onChange={(e) => setNewView({ ...newView, name: e.target.value })} placeholder="VD: Danh sách trạm" />
              </div>
              <div className="form-group">
                <label>Mô tả</label>
                <input type="text" value={newView.description} onChange={(e) => setNewView({ ...newView, description: e.target.value })} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Tạo mới</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}>
          <option value="">Tất cả entity</option>
          {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div>
        {views.length === 0 ? (
          <EmptyState icon="📊" title="Chưa có view nào" description="Tạo view để bắt đầu cấu hình bảng" />
        ) : views.map(v => (
          <div key={v.id} className="view-list-item">
            <div className="view-info">
              <h3>{v.name}</h3>
              <p>{v.entity} · {v.field_count || 0} columns · <span className={`badge badge-${v.status}`}>{v.status}</span></p>
              {v.description && <p style={{ fontStyle: 'italic' }}>{v.description}</p>}
            </div>
            <div className="view-actions">
              <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/views/${v.id}/edit`)}>
                Chỉnh sửa
              </button>
              <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(v.id, v.name)}>Xóa</button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadViews}
      />
    </div>
  );
};

export default AdminViewsPage;
