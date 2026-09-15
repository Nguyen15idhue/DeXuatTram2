import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formService } from '../../services/api';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import { Zap, ClipboardList, Users, Plus, Pencil, Trash2, FileText, PenLine, Eye, Lock, Unlock, Star } from 'lucide-react';

const ENTITIES = [
  { key: 'stations', label: 'Stations', icon: Zap, desc: 'Quản lý trạm sạc' },
  { key: 'station_proposals', label: 'Proposals', icon: ClipboardList, desc: 'Đề xuất trạm mới' },
  { key: 'users', label: 'Users', icon: Users, desc: 'Quản lý người dùng' },
];

const PURPOSES = [
  { key: 'create', label: 'Nhập liệu', icon: PenLine, color: 'text-blue-500' },
  { key: 'view', label: 'Xem / sửa', icon: Eye, color: 'text-green-500' },
];

const AdminFormsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });

  const loadForms = async () => {
    try {
      setLoading(true);
      const res = await formService.getAll('page=1&limit=200', token);
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

  const formsFor = (entity, purpose) =>
    forms.filter(f => f.entity === entity && f.purpose === purpose).sort((a, b) => (b.is_default - a.is_default) || (a.id - b.id));

  const handleCreate = async (entity, purpose) => {
    setError('');
    const purposeLabel = (PURPOSES.find(p => p.key === purpose) || {}).label || purpose;
    try {
      const res = await formService.create({
        entity,
        name: `Form ${entity} - ${purposeLabel}`,
        description: `Form ${purposeLabel.toLowerCase()} cho ${entity}`,
        purpose,
        is_default: formsFor(entity, purpose).length === 0 ? 1 : 0,
      }, token);
      if (res.success) {
        setToast({ message: `Tạo form ${purposeLabel} thành công`, type: 'success' });
        navigate(`/admin/forms/${res.data.id}/edit`);
      } else {
        setError(res.message || 'Tạo form thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const patchForm = async (form, patch) => {
    setError('');
    try {
      const res = await formService.update(form.id, {
        entity: form.entity,
        name: form.name,
        description: form.description || '',
        status: form.status,
        purpose: form.purpose,
        is_default: form.is_default,
        ...patch,
      }, token);
      if (res.success) {
        setForms(prev => prev.map(f => (f.id === form.id ? { ...f, ...res.data } : f)));
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
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="flex items-center gap-3 mb-2">
        <FileText size={24} className="text-primary" />
        <h1 className="text-2xl font-bold">Forms Manager</h1>
      </div>
      <p className="text-sm text-base-content/60 mb-6">
        Mỗi entity có form <b>Nhập liệu</b> (tạo mới) và <b>Xem/sửa</b>. Form <b>mặc định</b> (ngôi sao) là form được dùng khi mở trang.
        Form có ổ khóa là form hệ thống — chỉ sửa được, không xóa.
      </p>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadForms(); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa form"
        message={`Bạn có chắc chắn muốn xóa form "${confirmDelete.name}"? Các field liên kết cũng sẽ bị xóa.`}
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
          {ENTITIES.map(ent => (
            <div key={ent.key} className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ent.icon size={20} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="card-title text-base">{ent.label}</h3>
                    <span className="text-xs text-base-content/50">{ent.key}</span>
                  </div>
                </div>

                {PURPOSES.map(p => {
                  const list = formsFor(ent.key, p.key);
                  return (
                    <div key={p.key} className="mb-3 last:mb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p.icon size={14} className={p.color} />
                        <span className="text-sm font-medium">{p.label}</span>
                        <span className="badge badge-ghost badge-xs">{list.length}</span>
                        <button className="btn btn-outline btn-primary btn-xs gap-1 ml-auto" onClick={() => handleCreate(ent.key, p.key)}>
                          <Plus size={12} />
                          Thêm
                        </button>
                      </div>

                      {list.length === 0 && <p className="text-xs text-base-content/50 pl-5">Chưa có form.</p>}

                      <div className="space-y-2">
                        {list.map(f => (
                          <div key={f.id} className="border border-base-300 rounded-lg p-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {!!f.is_default && (
                                <span className="badge badge-primary badge-xs gap-1" title="Form mặc định">
                                  <Star size={10} /> Mặc định
                                </span>
                              )}
                              <span className="font-medium text-sm truncate">{f.name}</span>
                              {f.is_locked ? (
                                <span className="badge badge-warning badge-xs gap-1" title="Form hệ thống, không xóa được">
                                  <Lock size={10} /> Khóa
                                </span>
                              ) : (
                                <span className="badge badge-ghost badge-xs gap-1" title="Form tự tạo, xóa được">
                                  <Unlock size={10} />
                                </span>
                              )}
                              <span className="text-xs text-base-content/50 ml-auto">{f.field_count || 0} fields</span>
                            </div>

                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <label className="label cursor-pointer gap-2 py-0">
                                <span className="text-xs">{f.status === 'active' ? 'Bật' : 'Tắt'}</span>
                                <input
                                  type="checkbox"
                                  className="toggle toggle-xs toggle-success"
                                  checked={f.status === 'active'}
                                  onChange={(e) => patchForm(f, { status: e.target.checked ? 'active' : 'inactive' })}
                                />
                              </label>
                              <div className="ml-auto flex items-center gap-1">
                                <button className="btn btn-primary btn-xs gap-1" onClick={() => navigate(`/admin/forms/${f.id}/edit`)}>
                                  <Pencil size={12} />
                                  Sửa
                                </button>
                                <button
                                  className="btn btn-error btn-outline btn-xs gap-1"
                                  disabled={!!f.is_locked}
                                  title={f.is_locked ? 'Form hệ thống, không thể xóa' : 'Xóa form'}
                                  onClick={() => setConfirmDelete({ isOpen: true, id: f.id, name: f.name })}
                                >
                                  <Trash2 size={12} />
                                  Xóa
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminFormsPage;
