import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldDefinitionService } from '../../services/api';
import Loading from '../Loading';
import Toast from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import EmptyState from '../EmptyState';
import ErrorMessage from '../ErrorMessage';
import Pagination from '../Pagination';

const FIELD_TYPES = ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'file', 'formula'];
const ENTITIES = ['stations', 'station_proposals', 'users'];

const FieldManager = () => {
  const { token } = useAuth();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [editingId, setEditingId] = useState(null);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [form, setForm] = useState({
    entity: 'stations', key: '', label: '', type: 'text', source_type: 'json',
    required: false, options: '', placeholder: '', help_text: ''
  });

  const loadFields = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filterEntity) params.append('entity', filterEntity);
      if (filterStatus) params.append('status', filterStatus);
      const res = await fieldDefinitionService.getAll(params.toString(), token);
      if (res.success) {
        setFields(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách field definitions');
    } finally {
      setLoading(false);
    }
  }, [filterEntity, filterStatus, token]);

  useEffect(() => { loadFields(1); }, [loadFields]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      entity: filterEntity || 'stations', key: '', label: '', type: 'text', source_type: 'json',
      required: false, options: '', placeholder: '', help_text: ''
    });
    setShowForm(true);
    setError('');
  };

  const openEdit = (field) => {
    setEditingId(field.id);
    let opts = '';
    if (field.options) {
      try {
        const parsed = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
        opts = Array.isArray(parsed) ? parsed.map(o => o.label || o.value || o).join(', ') : '';
      } catch { opts = ''; }
    }
    setForm({
      entity: field.entity, key: field.key, label: field.label, type: field.type,
      source_type: field.source_type, required: !!field.required, options: opts,
      placeholder: field.placeholder || '', help_text: field.help_text || ''
    });
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.entity || !form.key || !form.label) {
      setError('Vui lòng nhập đầy đủ entity, key, label');
      return;
    }
    const payload = { ...form, required: form.required ? 1 : 0 };
    if (form.options) {
      payload.options = form.options.split(',').map(o => o.trim()).filter(Boolean).map(o => ({ label: o, value: o }));
    } else {
      payload.options = null;
    }
    try {
      let res;
      if (editingId) {
        res = await fieldDefinitionService.update(editingId, payload, token);
      } else {
        res = await fieldDefinitionService.create(payload, token);
      }
      if (res.success) {
        setToast({ message: editingId ? 'Cập nhật field thành công' : 'Tạo field thành công', type: 'success' });
        setShowForm(false);
        loadFields(pagination.page);
      } else {
        setError(res.message || 'Thao tác thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id, label) => {
    setConfirmDelete({ isOpen: true, id, name: label });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await fieldDefinitionService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa field thành công', type: 'success' });
        loadFields(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const res = await fieldDefinitionService.updateStatus(id, newStatus, token);
      if (res.success) {
        setToast({ message: `Field đã chuyển sang ${newStatus}`, type: 'success' });
        loadFields(pagination.page);
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading && fields.length === 0) return <Loading message="Đang tải field definitions..." />;

  return (
    <div className="admin-fields-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Field Definitions</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Thêm field</button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadFields(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa field"
        message={`Bạn có chắc chắn muốn xóa field "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Sửa field' : 'Thêm field mới'}</h2>
            <form onSubmit={handleSubmit}>
              {error && <ErrorMessage message={error} />}
              <div className="field-form">
                <div className="form-group">
                  <label>Entity *</label>
                  <select value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })}>
                    {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Key *</label>
                  <input type="text" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="vi_du_field" />
                </div>
                <div className="form-group">
                  <label>Label *</label>
                  <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Tên hiển thị" />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Placeholder</label>
                  <input type="text" value={form.placeholder} onChange={(e) => setForm({ ...form, placeholder: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Help Text</label>
                  <input type="text" value={form.help_text} onChange={(e) => setForm({ ...form, help_text: e.target.value })} />
                </div>
                <div className="form-group full-width">
                  <label>Options (phân tách bằng dấu phẩy, cho select/multiselect)</label>
                  <input type="text" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="Tùy chọn 1, Tùy chọn 2" />
                </div>
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} style={{ marginRight: 6 }} />
                    Bắt buộc
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Cập nhật' : 'Tạo mới'}</button>
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
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Entity</th>
              <th>Key</th>
              <th>Label</th>
              <th>Type</th>
              <th>Required</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 ? (
              <tr><td colSpan="8"><EmptyState icon="📋" title="Không có field nào" description="Thêm field definitions để bắt đầu" /></td></tr>
            ) : fields.map((f, idx) => (
              <tr key={f.id}>
                <td>{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td><span className="field-entity-badge">{f.entity}</span></td>
                <td><code>{f.key}</code></td>
                <td>{f.label}</td>
                <td><span className="field-type-badge">{f.type}</span></td>
                <td>{f.required ? '✓' : ''}</td>
                <td>
                  <span className={`badge badge-${f.status === 'active' ? 'active' : 'inactive'}`} style={{ cursor: 'pointer' }} onClick={() => handleToggleStatus(f.id, f.status)}>
                    {f.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm btn-edit" onClick={() => openEdit(f)}>Sửa</button>
                  <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(f.id, f.label)}>Xóa</button>
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
        onPageChange={loadFields}
      />
    </div>
  );
};

export default FieldManager;
