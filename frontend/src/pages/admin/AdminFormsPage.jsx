import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formService } from '../../services/api';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';

const ENTITIES = [
  { key: 'stations', label: 'Stations', icon: '⚡', desc: 'Quản lý trạm sạc' },
  { key: 'station_proposals', label: 'Proposals', icon: '📋', desc: 'Đề xuất trạm mới' },
  { key: 'users', label: 'Users', icon: '👥', desc: 'Quản lý người dùng' },
];

const ENTITY_NAMES = {
  stations: 'Form Stations',
  station_proposals: 'Form Proposals',
  users: 'Form Users',
};

const AdminFormsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '', entity: '' });

  const loadForms = async () => {
    try {
      setLoading(true);
      const res = await formService.getAll('page=1&limit=100', token);
      if (res.success) {
        setForms(res.data);
      }
    } catch {
      setError('Lỗi tải danh sách forms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadForms(); }, []);

  const getFormForEntity = (entity) => forms.find(f => f.entity === entity);

  const handleCreate = async (entity) => {
    setError('');
    try {
      const res = await formService.create({
        entity,
        name: ENTITY_NAMES[entity] || `Form ${entity}`,
        description: `Form cấu hình cho ${entity}`
      }, token);
      if (res.success) {
        setToast({ message: `Tạo form ${entity} thành công`, type: 'success' });
        navigate(`/admin/forms/${res.data.id}/edit`);
      } else {
        setError(res.message || 'Tạo form thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id, name, entity) => {
    setConfirmDelete({ isOpen: true, id, name, entity });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '', entity: '' });
    try {
      const res = await formService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa form thành công', type: 'success' });
        loadForms();
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  return (
    <div className="admin-forms-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Forms Manager</h1>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadForms(); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa form"
        message={`Bạn có chắc chắn muốn xóa form "${confirmDelete.name}"? Các field liên kết cũng sẽ bị xóa.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '', entity: '' })}
        confirmText="Xóa"
        type="danger"
      />

      <div className="entity-grid">
        {ENTITIES.map(ent => {
          const existingForm = getFormForEntity(ent.key);
          return (
            <div key={ent.key} className="entity-card">
              <div className="entity-card-header">
                <span className="entity-icon">{ent.icon}</span>
                <h3>{ent.label}</h3>
                <span className="entity-key">{ent.key}</span>
              </div>
              <p className="entity-desc">{ent.desc}</p>
              {existingForm ? (
                <div className="entity-card-status">
                  <span className="badge badge-active">Đã tạo</span>
                  <span className="entity-field-count">{existingForm.field_count || 0} fields</span>
                </div>
              ) : (
                <div className="entity-card-status">
                  <span className="badge badge-pending">Chưa tạo</span>
                </div>
              )}
              <div className="entity-card-actions">
                {existingForm ? (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/admin/forms/${existingForm.id}/edit`)}>
                      Chỉnh sửa
                    </button>
                    <button className="btn btn-delete btn-sm" onClick={() => handleDeleteClick(existingForm.id, existingForm.name, ent.key)}>
                      Xóa
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => handleCreate(ent.key)}>
                    + Tạo form
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminFormsPage;
