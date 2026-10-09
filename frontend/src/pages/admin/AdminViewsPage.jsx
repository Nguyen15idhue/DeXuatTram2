import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { viewService } from '../../services/api';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import { Zap, ClipboardList, Users, Plus, Pencil, Trash2, LayoutGrid, Lock, Unlock } from 'lucide-react';

const ENTITIES = [
  { key: 'stations', label: 'Stations', icon: Zap, desc: 'Bảng quản lý trạm' },
  { key: 'station_proposals', label: 'Proposals', icon: ClipboardList, desc: 'Bảng đề xuất trạm' },
  { key: 'users', label: 'Users', icon: Users, desc: 'Bảng quản lý người dùng' },
  { key: 'leads', label: 'Leads', icon: ClipboardList, desc: 'Bảng quản lý Lead' },
];

const USAGE_OPTIONS = [
  { value: 'table', label: 'Bảng danh sách', badge: 'badge-primary' },
  { value: 'excel_full', label: 'Excel đầy đủ', badge: 'badge-success' },
  { value: 'excel_basic', label: 'Excel Tạo nhanh', badge: 'badge-info' },
];

const usageMeta = (usage) => USAGE_OPTIONS.find(u => u.value === usage) || { value: usage, label: usage, badge: 'badge-ghost' };

const defaultIncludeRest = (usage) => usage !== 'excel_basic';

const AdminViewsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [createEntity, setCreateEntity] = useState('stations');
  const [createName, setCreateName] = useState('');
  const [createUsage, setCreateUsage] = useState('table');
  const [createDesc, setCreateDesc] = useState('');
  const [createStatus, setCreateStatus] = useState('active');
  const [createIncludeRest, setCreateIncludeRest] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadViews = async () => {
    try {
      setLoading(true);
      const res = await viewService.getAll('page=1&limit=200', token);
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

  const viewsForEntity = (entity) => views.filter(v => v.entity === entity).sort((a, b) => a.id - b.id);

  const openCreate = (entity) => {
    setError('');
    setCreateEntity(entity);
    setCreateName(`View ${entity} ${viewsForEntity(entity).length + 1}`);
    setCreateUsage('table');
    setCreateDesc('');
    setCreateStatus('active');
    setCreateIncludeRest(defaultIncludeRest('table'));
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      setError('Vui lòng nhập tên view');
      return;
    }
    setError('');
    setCreating(true);
    try {
      const res = await viewService.create({
        entity: createEntity,
        name: createName.trim(),
        description: createDesc.trim(),
        status: createStatus,
        usage: createUsage,
        include_rest: createIncludeRest ? 1 : 0,
      }, token);
      if (res.success) {
        setCreateOpen(false);
        setToast({ message: `Tạo view ${createEntity} thành công`, type: 'success' });
        navigate(`/admin/views/${res.data.id}/edit`);
      } else {
        setError(res.message || 'Tạo view thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setCreating(false);
    }
  };

  const patchView = async (view, patch) => {
    setError('');
    try {
      const res = await viewService.update(view.id, {
        entity: view.entity,
        name: view.name,
        description: view.description || '',
        status: view.status,
        usage: view.usage,
        ...patch,
      }, token);
      if (res.success) {
        setViews(prev => prev.map(v => (v.id === view.id ? { ...v, ...res.data } : v)));
      } else {
        setError(res.message || 'Cập nhật thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
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

      <div className="flex items-center gap-3 mb-2">
        <LayoutGrid size={24} className="text-primary" />
        <h1 className="text-2xl font-bold">Views Manager</h1>
      </div>
      <p className="text-sm text-base-content/60 mb-6">
        Mỗi entity có 3 loại view: <b>Bảng danh sách</b> (hiển thị bảng), <b>Excel đầy đủ</b> và <b>Excel Tạo nhanh</b> (dùng cho Template/Import/Export).
        View có ổ khóa là view hệ thống — chỉ sửa được, không xóa.
      </p>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadViews(); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa view"
        message={`Bạn có chắc chắn muốn xóa view "${confirmDelete.name}"? Các field liên kết cũng sẽ bị xóa.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {ENTITIES.map(ent => {
            const list = viewsForEntity(ent.key);
            return (
              <div key={ent.key} className="card bg-base-100 shadow-sm border border-base-300">
                <div className="card-body p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ent.icon size={20} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="card-title text-base">{ent.label}</h3>
                      <span className="text-xs text-base-content/50">{ent.key} · {list.length} view</span>
                    </div>
                    <button className="btn btn-primary btn-xs gap-1 ml-auto" onClick={() => openCreate(ent.key)}>
                      <Plus size={12} />
                      Thêm view
                    </button>
                  </div>

                  {list.length === 0 && <p className="text-sm text-base-content/50">Chưa có view nào.</p>}

                  <div className="space-y-2">
                    {list.map(v => {
                      const meta = usageMeta(v.usage);
                      return (
                        <div key={v.id} className="border border-base-300 rounded-lg p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`badge badge-sm ${meta.badge}`}>{meta.label}</span>
                            <span className="font-medium text-sm truncate">{v.name}</span>
                            {v.is_locked ? (
                              <span className="badge badge-warning badge-xs gap-1" title="View hệ thống, không xóa được">
                                <Lock size={10} /> Khóa
                              </span>
                            ) : (
                              <span className="badge badge-ghost badge-xs gap-1" title="View tự tạo, xóa được">
                                <Unlock size={10} />
                              </span>
                            )}
                            <span className="text-xs text-base-content/50 ml-auto">{v.field_count || 0} cột</span>
                          </div>

                          {v.description && <p className="text-xs text-base-content/60 mt-1">{v.description}</p>}

                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <select
                              className="select select-bordered select-xs"
                              value={v.usage}
                              onChange={(e) => patchView(v, { usage: e.target.value })}
                              title="Dùng ở đâu"
                            >
                              {USAGE_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                            </select>
                            <label className="label cursor-pointer gap-2 py-0">
                              <span className="text-xs">{v.status === 'active' ? 'Bật' : 'Tắt'}</span>
                              <input
                                type="checkbox"
                                className="toggle toggle-xs toggle-success"
                                checked={v.status === 'active'}
                                onChange={(e) => patchView(v, { status: e.target.checked ? 'active' : 'inactive' })}
                              />
                            </label>
                            <label className="label cursor-pointer gap-2 py-0" title="Bật: template/export/import dùng cột trong view + nối thêm field còn lại. Tắt: chỉ đúng cột trong view.">
                              <span className="text-xs">Nối thêm field</span>
                              <input
                                type="checkbox"
                                className="toggle toggle-xs toggle-info"
                                checked={Number(v.include_rest ?? (v.usage === 'excel_basic' ? 0 : 1)) === 1}
                                onChange={(e) => patchView(v, { include_rest: e.target.checked ? 1 : 0 })}
                              />
                            </label>
                            <div className="ml-auto flex items-center gap-1">
                              <button className="btn btn-primary btn-xs gap-1" onClick={() => navigate(`/admin/views/${v.id}/edit`)}>
                                <Pencil size={12} />
                                Sửa
                              </button>
                              <button
                                className="btn btn-error btn-outline btn-xs gap-1"
                                disabled={!!v.is_locked}
                                title={v.is_locked ? 'View hệ thống, không thể xóa' : 'Xóa view'}
                                onClick={() => setConfirmDelete({ isOpen: true, id: v.id, name: v.name })}
                              >
                                <Trash2 size={12} />
                                Xóa
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <dialog className="modal modal-open" onCancel={(e) => e.preventDefault()}>
          <div className="modal-box max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Thêm view mới</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setCreateOpen(false)} aria-label="Đóng">✕</button>
            </div>
            <div className="space-y-3">
              <div className="form-control">
                <label className="label"><span className="label-text">Entity</span></label>
                <input type="text" className="input input-bordered w-full" value={createEntity} disabled />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Tên view *</span></label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="VD: Excel Đề xuất - Rút gọn"
                />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Loại view</span></label>
                <select
                  className="select select-bordered w-full"
                  value={createUsage}
                  onChange={(e) => { setCreateUsage(e.target.value); setCreateIncludeRest(defaultIncludeRest(e.target.value)); }}
                >
                  {USAGE_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
                <label className="label"><span className="label-text-alt">Bảng danh sách: hiển thị bảng. Excel: dùng cho Template/Import/Export.</span></label>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Mô tả</span></label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Mô tả ngắn (tùy chọn)"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="label cursor-pointer gap-2">
                  <span className="label-text">Kích hoạt</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-success"
                    checked={createStatus === 'active'}
                    onChange={(e) => setCreateStatus(e.target.checked ? 'active' : 'inactive')}
                  />
                </label>
                <label className="label cursor-pointer gap-2" title="Bật: template/export/import dùng cột trong view + nối thêm field còn lại. Tắt: chỉ đúng cột trong view.">
                  <span className="label-text">Nối thêm field còn lại</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-info"
                    checked={createIncludeRest}
                    onChange={(e) => setCreateIncludeRest(e.target.checked)}
                  />
                </label>
              </div>
              <p className="text-xs text-base-content/60">
                {createIncludeRest
                  ? 'Template/Export/Import sẽ gồm cột trong view + toàn bộ field còn lại.'
                  : 'Template/Export/Import chỉ gồm đúng các cột trong view. View mới sẽ được thêm sẵn cột cốt lõi (hoặc trường bắt buộc) — chỉnh tiếp ở trang cấu hình.'}
              </p>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !createName.trim()}>
                {creating ? 'Đang tạo...' : 'Tạo & cấu hình cột'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" />
        </dialog>
      )}
    </div>
  );
};

export default AdminViewsPage;
