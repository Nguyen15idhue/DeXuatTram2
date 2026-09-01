import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { viewService } from '../../services/api';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';

const ENTITIES = [
  { key: 'stations', label: 'Stations', icon: '⚡', desc: 'Bảng quản lý trạm' },
  { key: 'station_proposals', label: 'Proposals', icon: '📋', desc: 'Bảng đề xuất trạm' },
  { key: 'users', label: 'Users', icon: '👥', desc: 'Bảng quản lý người dùng' },
];

const ENTITY_NAMES = {
  stations: 'View Stations',
  station_proposals: 'View Proposals',
  users: 'View Users',
};

const AdminViewsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '', entity: '' });

  const loadViews = async () => {
    try {
      setLoading(true);
      const res = await viewService.getAll('page=1&limit=100', token);
      if (res.success) {
        setViews(res.data);
      }
    } catch {
      setError('Lỗi tải danh sách views');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadViews(); }, []);

  const getViewForEntity = (entity) => views.find(v => v.entity === entity);

  const handleCreate = async (entity) => {
    setError('');
    try {
      const res = await viewService.create({
        entity,
        name: ENTITY_NAMES[entity] || `View ${entity}`,
        description: `Bảng hiển thị cho ${entity}`
      }, token);
      if (res.success) {
        setToast({ message: `Tạo view ${entity} thành công`, type: 'success' });
        navigate(`/admin/views/${res.data.id}/edit`);
      } else {
        setError(res.message || 'Tạo view thất bại');
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
      const res = await viewService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa view thành công', type: 'success' });
        loadViews();
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  return (
    <div className="admin-views-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Views Manager</h1>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadViews(); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa view"
        message={`Bạn có chắc chắn muốn xóa view "${confirmDelete.name}"? Các field liên kết cũng sẽ bị xóa.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '', entity: '' })}
        confirmText="Xóa"
        type="danger"
      />

      <div className="entity-grid">
        {ENTITIES.map(ent => {
          const existingView = getViewForEntity(ent.key);
          return (
            <div key={ent.key} className="entity-card">
              <div className="entity-card-header">
                <span className="entity-icon">{ent.icon}</span>
                <h3>{ent.label}</h3>
                <span className="entity-key">{ent.key}</span>
              </div>
              <p className="entity-desc">{ent.desc}</p>
              {existingView ? (
                <div className="entity-card-status">
                  <span className="badge badge-active">Đã tạo</span>
                  <span className="entity-field-count">{existingView.field_count || 0} columns</span>
                </div>
              ) : (
                <div className="entity-card-status">
                  <span className="badge badge-pending">Chưa tạo</span>
                </div>
              )}
              <div className="entity-card-actions">
                {existingView ? (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/admin/views/${existingView.id}/edit`)}>
                      Chỉnh sửa
                    </button>
                    <button className="btn btn-delete btn-sm" onClick={() => handleDeleteClick(existingView.id, existingView.name, ent.key)}>
                      Xóa
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => handleCreate(ent.key)}>
                    + Tạo view
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

export default AdminViewsPage;
