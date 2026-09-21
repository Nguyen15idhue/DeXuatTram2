import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formService } from '../../services/api';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Dialog from '../../components/ui/Dialog';
import { Zap, ClipboardList, Users, Plus, Pencil, Trash2, FileText, PenLine, Eye, Lock, Unlock, Star, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
  const [syncModal, setSyncModal] = useState({ isOpen: false, form: null, plan: null, loading: false, error: '', syncDesc: true, submitting: false });

  const closeSyncModal = () => setSyncModal({ isOpen: false, form: null, plan: null, loading: false, error: '', syncDesc: true, submitting: false });

  const openSyncModal = async (form) => {
    setError('');
    setSyncModal({ isOpen: true, form, plan: null, loading: true, error: '', syncDesc: true, submitting: false });
    try {
      const res = await formService.syncPreview(form.id, token);
      if (res.success) {
        setSyncModal(prev => ({ ...prev, plan: res.data, loading: false, syncDesc: !!res.data.descConfig }));
      } else {
        setSyncModal(prev => ({ ...prev, loading: false, error: res.message || 'Không xem trước được cấu hình' }));
      }
    } catch {
      setSyncModal(prev => ({ ...prev, loading: false, error: 'Lỗi kết nối server' }));
    }
  };

  const handleConfirmSync = async () => {
    const { form, syncDesc } = syncModal;
    if (!form) return;
    setSyncModal(prev => ({ ...prev, submitting: true }));
    try {
      const res = await formService.syncFromCreate(form.id, { syncDesc }, token);
      if (res.success) {
        const s = res.data.summary || {};
        const extra = (s.parkedFromSource || 0) + (s.extraOnly || 0);
        setToast({
          message: `Đã đồng bộ ${s.newFieldCount || 0} trường từ form Nhập liệu${extra ? `, ${extra} trường vào section riêng` : ''}${res.data.descConfig ? ', cập nhật mô tả 1Office' : ''}`,
          type: 'success'
        });
        closeSyncModal();
        loadForms();
      } else {
        setSyncModal(prev => ({ ...prev, submitting: false, error: res.message || 'Đồng bộ thất bại' }));
      }
    } catch {
      setSyncModal(prev => ({ ...prev, submitting: false, error: 'Lỗi kết nối server' }));
    }
  };

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

      <Dialog isOpen={syncModal.isOpen} onClose={closeSyncModal} title="Đồng bộ cấu hình từ form Nhập liệu" size="xl">
        {syncModal.loading && (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        )}

        {!syncModal.loading && syncModal.error && (
          <div className="alert alert-error text-sm mb-4">
            <AlertTriangle size={16} />
            <span>{syncModal.error}</span>
          </div>
        )}

        {!syncModal.loading && syncModal.plan && (
          <div className="space-y-4">
            <div className="alert alert-warning text-xs items-start">
              <AlertTriangle size={16} />
              <span>
                Form <b>{syncModal.plan.targetForm.name}</b> sẽ bị <b>ghi đè</b> toàn bộ layout + danh sách trường theo form{' '}
                <b>{syncModal.plan.sourceForm.name}</b>. Trường không có trong form Nhập liệu (hoặc không được xếp vị trí) sẽ được gom vào
                section riêng <b>“{syncModal.plan.extraSectionTitle}”</b> ở cuối form.
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-base-200 rounded-lg p-3">
                <div className="text-xs text-base-content/60">Trường sau đồng bộ</div>
                <div className="text-xl font-semibold">{syncModal.plan.summary.newFieldCount}</div>
              </div>
              <div className="bg-base-200 rounded-lg p-3">
                <div className="text-xs text-base-content/60">Lấy từ Nhập liệu</div>
                <div className="text-xl font-semibold">{syncModal.plan.summary.keptCount}</div>
              </div>
              <div className="bg-base-200 rounded-lg p-3">
                <div className="text-xs text-base-content/60">Vào section riêng</div>
                <div className="text-xl font-semibold">
                  {(syncModal.plan.summary.parkedFromSource || 0) + (syncModal.plan.summary.extraOnly || 0)}
                </div>
              </div>
              <div className="bg-base-200 rounded-lg p-3">
                <div className="text-xs text-base-content/60">Ghi đè cấu hình</div>
                <div className="text-xl font-semibold">{syncModal.plan.summary.replaced}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-sm mb-2">Section sau đồng bộ ({syncModal.plan.sections.length})</h4>
                <div className="border border-base-300 rounded-lg divide-y divide-base-200 max-h-64 overflow-y-auto">
                  {syncModal.plan.sections.map(sec => (
                    <div key={sec.id} className="p-2 flex items-center gap-2">
                      <span className={`text-sm truncate ${sec.id === 'sync_extra_section' ? 'text-info font-medium' : ''}`}>
                        {sec.title}
                      </span>
                      {sec.type === 'tabs' && <span className="badge badge-ghost badge-xs">tabs</span>}
                      {sec.condition && (
                        <span className="badge badge-outline badge-xs">{sec.condition.field} = {sec.condition.value}</span>
                      )}
                      <span className="ml-auto text-xs text-base-content/60">{sec.fields.length} trường</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">
                  Trường vào section riêng ({(syncModal.plan.summary.parkedFromSource || 0) + (syncModal.plan.summary.extraOnly || 0)})
                </h4>
                {syncModal.plan.parked.length === 0 ? (
                  <p className="text-xs text-base-content/60 flex items-center gap-1">
                    <CheckCircle2 size={14} className="text-success" />
                    Form Nhập liệu và form Xem/sửa đã giống nhau.
                  </p>
                ) : (
                  <div className="border border-base-300 rounded-lg divide-y divide-base-200 max-h-64 overflow-y-auto">
                    {syncModal.plan.parked.map(item => (
                      <div key={item.key} className="p-2 flex items-center gap-2">
                        <span className="text-sm truncate">{item.label}</span>
                        <span className="badge badge-ghost badge-xs">{item.reason === 'no_row' ? 'chưa xếp vị trí' : 'chỉ có ở form xem/sửa'}</span>
                        <span className="ml-auto text-xs text-base-content/50 font-mono">{item.key}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {syncModal.plan.descConfig && (
              <label className="label cursor-pointer justify-start gap-3 border border-base-300 rounded-lg p-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm checkbox-primary"
                  checked={syncModal.syncDesc}
                  onChange={(e) => setSyncModal(prev => ({ ...prev, syncDesc: e.target.checked }))}
                />
                <span className="text-sm">
                  Cập nhật luôn mẫu <b>Mô tả đẩy sang 1Office</b> ({syncModal.plan.descConfig.name} — {syncModal.plan.descConfig.sectionCount} section)
                </span>
              </label>
            )}

            {syncModal.error && <div className="text-error text-xs">{syncModal.error}</div>}

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={closeSyncModal} disabled={syncModal.submitting}>Hủy</button>
              <button className="btn btn-info gap-2" onClick={handleConfirmSync} disabled={syncModal.submitting}>
                {syncModal.submitting ? <span className="loading loading-spinner loading-xs"></span> : <RefreshCw size={14} />}
                Đồng bộ
              </button>
            </div>
          </div>
        )}
      </Dialog>

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
                                {f.purpose === 'view' && (
                                  <button
                                    className="btn btn-outline btn-info btn-xs gap-1"
                                    title="Đồng bộ layout/trường từ form Nhập liệu"
                                    onClick={() => openSyncModal(f)}
                                  >
                                    <RefreshCw size={12} />
                                    Đồng bộ
                                  </button>
                                )}
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
