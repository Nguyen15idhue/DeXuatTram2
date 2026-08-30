import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formService } from '../../services/api';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';

const ENTITIES = ['stations', 'station_proposals', 'users'];

const AdminFormsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [filterEntity, setFilterEntity] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [newForm, setNewForm] = useState({ entity: 'stations', name: '', description: '' });

  const loadForms = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filterEntity) params.append('entity', filterEntity);
      const res = await formService.getAll(params.toString(), token);
      if (res.success) {
        setForms(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách forms');
    } finally {
      setLoading(false);
    }
  }, [filterEntity, token]);

  useEffect(() => { loadForms(1); }, [loadForms]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newForm.name.trim()) { setError('Vui lòng nhập tên form'); return; }
    try {
      const res = await formService.create(newForm, token);
      if (res.success) {
        setToast({ message: 'Tạo form thành công', type: 'success' });
        setShowCreate(false);
        setNewForm({ entity: 'stations', name: '', description: '' });
        navigate(`/admin/forms/${res.data.id}/edit`);
      } else {
        setError(res.message || 'Tạo form thất bại');
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
      const res = await formService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa form thành công', type: 'success' });
        loadForms(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading && forms.length === 0) return <Loading message="Đang tải danh sách forms..." />;

  return (
    <div className="admin-forms-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Forms Manager</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Tạo form</button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadForms(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa form"
        message={`Bạn có chắc chắn muốn xóa form "${confirmDelete.name}"? Các field liên kết cũng sẽ bị xóa.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Tạo form mới</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Entity *</label>
                <select value={newForm.entity} onChange={(e) => setNewForm({ ...newForm, entity: e.target.value })}>
                  {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tên form *</label>
                <input type="text" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="VD: Form tạo trạm" />
              </div>
              <div className="form-group">
                <label>Mô tả</label>
                <input type="text" value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} />
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
        {forms.length === 0 ? (
          <EmptyState icon="📋" title="Chưa có form nào" description="Tạo form để bắt đầu cấu hình" />
        ) : forms.map(form => (
          <div key={form.id} className="form-list-item">
            <div className="form-info">
              <h3>{form.name}</h3>
              <p>{form.entity} · {form.field_count || 0} fields · <span className={`badge badge-${form.status}`}>{form.status}</span></p>
              {form.description && <p style={{ fontStyle: 'italic' }}>{form.description}</p>}
            </div>
            <div className="form-actions">
              <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/forms/${form.id}/edit`)}>
                Chỉnh sửa
              </button>
              <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(form.id, form.name)}>Xóa</button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadForms}
      />
    </div>
  );
};

export default AdminFormsPage;
