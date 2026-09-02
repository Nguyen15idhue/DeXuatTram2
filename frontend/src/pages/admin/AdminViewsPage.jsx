import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { viewService } from '../../services/api';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import { Zap, ClipboardList, Users, Plus, Pencil, Trash2, LayoutGrid } from 'lucide-react';

const ENTITIES = [
  { key: 'stations', label: 'Stations', icon: Zap, desc: 'Bảng quản lý trạm' },
  { key: 'station_proposals', label: 'Proposals', icon: ClipboardList, desc: 'Bảng đề xuất trạm' },
  { key: 'users', label: 'Users', icon: Users, desc: 'Bảng quản lý người dùng' },
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
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="flex items-center gap-3 mb-6">
        <LayoutGrid size={24} className="text-primary" />
        <h1 className="text-2xl font-bold">Views Manager</h1>
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

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ENTITIES.map(ent => {
            const existingView = getViewForEntity(ent.key);
            return (
              <div key={ent.key} className="card bg-base-100 shadow-sm border border-base-300">
                <div className="card-body">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ent.icon size={20} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="card-title text-base">{ent.label}</h3>
                      <span className="text-xs text-base-content/50">{ent.key}</span>
                    </div>
                  </div>
                  <p className="text-sm text-base-content/60">{ent.desc}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {existingView ? (
                      <>
                        <span className="badge badge-success badge-sm">Đã tạo</span>
                        <span className="text-xs text-base-content/50">{existingView.field_count || 0} columns</span>
                      </>
                    ) : (
                      <span className="badge badge-ghost badge-sm">Chưa tạo</span>
                    )}
                  </div>
                  <div className="card-actions justify-end mt-4">
                    {existingView ? (
                      <>
                        <button className="btn btn-primary btn-sm gap-1" onClick={() => navigate(`/admin/views/${existingView.id}/edit`)}>
                          <Pencil size={14} />
                          Chỉnh sửa
                        </button>
                        <button className="btn btn-error btn-outline btn-sm gap-1" onClick={() => handleDeleteClick(existingView.id, existingView.name, ent.key)}>
                          <Trash2 size={14} />
                          Xóa
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm gap-1" onClick={() => handleCreate(ent.key)}>
                        <Plus size={14} />
                        Tạo view
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminViewsPage;
