import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiConfigService } from '../../services/api';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Settings, Plus, Pencil, Trash2, Wifi, WifiOff, X, ArrowRightLeft, RefreshCw } from 'lucide-react';
import FieldMappingPanel from '../../components/admin/FieldMappingPanel';
import SyncPanel from '../../components/admin/SyncPanel';

const AUTH_TYPES = [
  { value: 'token', label: 'Token (Bearer)' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'api_key', label: 'API Key' }
];

const AdminApiConfigPage = () => {
  const { token, user } = useAuth();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [mappingConfig, setMappingConfig] = useState(null);
  const [syncConfig, setSyncConfig] = useState(null);

  const [form, setForm] = useState({
    name: '',
    base_url: '',
    auth_type: 'token',
    auth_config: '',
    description: '',
    is_active: true
  });
  const [formError, setFormError] = useState('');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiConfigService.getAll('', token);
      if (res.success) {
        setConfigs(res.data);
      }
    } catch {
      setError('Lỗi tải danh sách cấu hình API');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const openCreateModal = () => {
    setEditingConfig(null);
    setForm({ name: '', base_url: 'https://egr.1office.vn', auth_type: 'token', auth_config: '', description: '', is_active: true });
    setFormError('');
    setTestResult(null);
    setShowModal(true);
  };

  const openEditModal = (config) => {
    setEditingConfig(config);
    const authConfig = typeof config.auth_config === 'string' ? JSON.parse(config.auth_config) : config.auth_config;
    setForm({
      name: config.name,
      base_url: config.base_url,
      auth_type: config.auth_type || 'token',
      auth_config: authConfig.token || authConfig.access_token || '',
      description: config.description || '',
      is_active: !!config.is_active
    });
    setFormError('');
    setTestResult(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Tên cấu hình không được để trống'); return; }
    if (!form.base_url.trim()) { setFormError('Base URL không được để trống'); return; }
    if (!form.auth_config.trim()) { setFormError('Token không được để trống'); return; }

    try {
      const payload = {
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        auth_type: form.auth_type,
        auth_config: { token: form.auth_config.trim() },
        description: form.description.trim() || null,
        is_active: form.is_active
      };

      let res;
      if (editingConfig) {
        res = await apiConfigService.update(editingConfig.id, payload, token);
      } else {
        res = await apiConfigService.create(payload, token);
      }

      if (res.success) {
        setToast({ message: editingConfig ? 'Cập nhật thành công' : 'Tạo mới thành công', type: 'success' });
        setShowModal(false);
        loadConfigs();
      } else {
        setFormError(res.message || 'Thao tác thất bại');
      }
    } catch {
      setFormError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id, name) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await apiConfigService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa cấu hình thành công', type: 'success' });
        loadConfigs();
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleTestConnection = async (id) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiConfigService.testConnection(id, token);
      if (res.success) {
        setTestResult(res.data);
      } else {
        setTestResult({ status: 'failed', error: res.message });
      }
    } catch {
      setTestResult({ status: 'failed', error: 'Lỗi kết nối server' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa cấu hình API"
        message={`Bạn có chắc chắn muốn xóa cấu hình "${confirmDelete.name}"? Field mappings liên quan cũng sẽ bị xóa.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">{editingConfig ? 'Sửa cấu hình API' : 'Thêm API mới'}</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="alert alert-error mb-3">
                <span className="text-sm">{formError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="form-control">
                <label className="label"><span className="label-text">Tên cấu hình *</span></label>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: 1Office CRM"
                />
              </div>

              <div className="form-control">
                <label className="label"><span className="label-text">Base URL *</span></label>
                <input
                  type="url"
                  className="input input-bordered input-sm"
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://egr.1office.vn"
                />
              </div>

              <div className="form-control">
                <label className="label"><span className="label-text">Loại xác thực</span></label>
                <select
                  className="select select-bordered select-sm"
                  value={form.auth_type}
                  onChange={(e) => setForm({ ...form, auth_type: e.target.value })}
                >
                  {AUTH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="form-control">
                <label className="label"><span className="label-text">Token / API Key *</span></label>
                <input
                  type="password"
                  className="input input-bordered input-sm"
                  value={form.auth_config}
                  onChange={(e) => setForm({ ...form, auth_config: e.target.value })}
                  placeholder="Nhập token..."
                />
              </div>

              <div className="form-control">
                <label className="label"><span className="label-text">Mô tả</span></label>
                <textarea
                  className="textarea textarea-bordered textarea-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Mô tả cấu hình..."
                />
              </div>

              <div className="form-control">
                <label className="label cursor-pointer gap-3">
                  <span className="label-text">Kích hoạt</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                </label>
              </div>
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave}>
                {editingConfig ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setShowModal(false)} />
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">API Configurations</h1>
        </div>
        {isSuperAdmin && (
          <button className="btn btn-primary btn-sm gap-1" onClick={openCreateModal}>
            <Plus size={16} />
            Thêm API
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => { setError(''); loadConfigs(); }}>Thử lại</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-12 text-base-content/50">
          <Settings size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Chưa có cấu hình API nào</p>
          <p className="text-sm mt-1">Nhấn "Thêm API" để bắt đầu</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {configs.map((config) => (
            <div key={config.id} className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.is_active ? 'bg-success/10' : 'bg-base-300'}`}>
                      {config.is_active ? <Wifi size={20} className="text-success" /> : <WifiOff size={20} className="text-base-content/40" />}
                    </div>
                    <div>
                      <h3 className="card-title text-base">{config.name}</h3>
                      <span className="text-xs text-base-content/50">{config.auth_type}</span>
                    </div>
                  </div>
                  <span className={`badge badge-sm ${config.is_active ? 'badge-success' : 'badge-ghost'}`}>
                    {config.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="text-xs text-base-content/60 space-y-1 mb-3">
                  <div className="truncate" title={config.base_url}>URL: {config.base_url}</div>
                  {config.description && <div className="truncate">{config.description}</div>}
                </div>

                {/* Test Connection Result */}
                {testResult && (
                  <div className={`alert ${testResult.status === 'connected' ? 'alert-success' : 'alert-error'} mb-3 py-2`}>
                    <span className="text-xs">
                      {testResult.status === 'connected'
                        ? `Connected (${testResult.response_time}ms)`
                        : `Failed: ${testResult.error}`}
                    </span>
                  </div>
                )}

                <div className="card-actions justify-end gap-1 mt-auto">
                  <button
                    className="btn btn-outline btn-sm gap-1"
                    onClick={() => setSyncConfig(syncConfig?.id === config.id ? null : config)}
                  >
                    <RefreshCw size={14} />
                    Sync
                  </button>
                  <button
                    className="btn btn-outline btn-sm gap-1"
                    onClick={() => setMappingConfig(mappingConfig?.id === config.id ? null : config)}
                  >
                    <ArrowRightLeft size={14} />
                    Mapping
                  </button>
                  <button
                    className={`btn btn-outline btn-sm gap-1 ${testing ? 'loading' : ''}`}
                    onClick={() => handleTestConnection(config.id)}
                    disabled={testing}
                  >
                    <Wifi size={14} />
                    Test
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button className="btn btn-primary btn-sm gap-1" onClick={() => openEditModal(config)}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-error btn-outline btn-sm gap-1" onClick={() => handleDeleteClick(config.id, config.name)}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Field Mapping Panel */}
      {mappingConfig && (
        <div className="mt-6">
          <FieldMappingPanel
            configId={mappingConfig.id}
            onClose={() => setMappingConfig(null)}
          />
        </div>
      )}

      {/* Sync Panel */}
      {syncConfig && (
        <div className="mt-6">
          <SyncPanel
            configId={syncConfig.id}
            onClose={() => setSyncConfig(null)}
          />
        </div>
      )}
    </div>
  );
};

export default AdminApiConfigPage;
