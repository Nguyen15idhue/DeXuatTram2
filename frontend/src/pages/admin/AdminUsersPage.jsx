import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminUserService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DynamicForm from '../../components/dynamic/DynamicForm';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
import { Users, Plus, Search, Download, Upload, FileSpreadsheet, X } from 'lucide-react';

const USERS_VIEW_ID = 7;
const USERS_FORM_ID = 8;

const AdminUsersPage = () => {
  const { token, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSelectOptions } = useFieldOptions('users');
  const statusOptions = getSelectOptions('status');
  const roleOptions = getSelectOptions('role');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view' });
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    const match = location.pathname.match(/\/admin\/users\/(view|edit)=(\d+)/);
    if (match) {
      const mode = match[1];
      const id = parseInt(match[2]);
      const existingUser = users.find(u => u.id === id);
      setPopup({ open: true, record: existingUser || null, mode });
      if (!existingUser && id) loadUserById(id, mode);
    } else {
      setPopup({ open: false, record: null, mode: 'view' });
    }
  }, [location.pathname, users.length]);

  const loadUserById = async (id, mode) => {
    try {
      const res = await adminUserService.getAllWithParams('', token);
      if (res.success) {
        const user = res.data.find(u => u.id === id);
        if (user) setPopup({ open: true, record: user, mode });
      }
    } catch { /* silent */ }
  };

  useEffect(() => { loadUsers(1); }, []);

  const loadUsers = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (search) params.append('search', search);
      if (filterStatus) params.append('status', filterStatus);
      const res = await adminUserService.getAllWithParams(params.toString(), token);
      if (res.success) {
        setUsers(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách users');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, token]);

  useEffect(() => { loadUsers(1); }, [loadUsers]);

  const handleSearch = () => { loadUsers(1); };

  const handleDeleteClick = (id, name) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await adminUserService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa user thành công', type: 'success' });
        loadUsers(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleToggleLock = async (id) => {
    try {
      const res = await adminUserService.toggleLock(id, token);
      if (res.success) {
        setToast({ message: res.message, type: 'success' });
        loadUsers(pagination.page);
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleExport = async () => {
    try {
      await excelService.exportData('users', token);
      setToast({ message: 'Export users thành công', type: 'success' });
    } catch {
      setError('Lỗi export users');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await excelService.downloadTemplate('users', token);
    } catch {
      setError('Lỗi download template');
    }
  };

  const handleCreateUser = async (formData) => {
    const payload = {
      full_name: formData.full_name || '',
      email: formData.email || '',
      phone: formData.phone || '',
      password: formData.password || '123456',
      role: formData.role || 'USER',
      status: formData.status || 'ACTIVE'
    };
    const customData = {};
    const fixedKeys = ['full_name', 'email', 'phone', 'password', 'role', 'status'];
    Object.keys(formData).forEach(k => {
      if (!fixedKeys.includes(k) && formData[k] !== undefined && formData[k] !== '') {
        customData[k] = formData[k];
      }
    });
    if (Object.keys(customData).length > 0) {
      payload.custom_data = customData;
    }
    if (!payload.full_name || !payload.email) {
      throw new Error('Vui lòng nhập đầy đủ họ tên và email');
    }
    const res = await adminUserService.create(payload, token);
    if (res.success) {
      setToast({ message: 'Tạo user thành công', type: 'success' });
      setShowCreateForm(false);
      loadUsers(1);
    } else {
      throw new Error(res.message || 'Tạo user thất bại');
    }
  };

  const openImport = () => {
    setShowImport(true);
    setImportFile(null);
    setImportPreview(null);
    setImportStep('upload');
    setError('');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImportFile(file);
      setImportPreview(null);
      setImportStep('upload');
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) { setError('Vui lòng chọn file Excel'); return; }
    try {
      setImportLoading(true);
      const res = await excelService.previewImport('users', importFile, token);
      if (res.success) {
        setImportPreview(res.data);
        setImportStep('preview');
      } else {
        setError(res.message || 'Lỗi đọc file Excel');
      }
    } catch {
      setError('Lỗi đọc file Excel. Vui lòng kiểm tra lại định dạng file.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) { setError('Không có dữ liệu hợp lệ để import'); return; }
    try {
      setImportLoading(true);
      const res = await excelService.confirmImport('users', importPreview.rows, token);
      if (res.success) {
        setShowImport(false);
        setToast({ message: res.message, type: 'success' });
        loadUsers(1);
      } else {
        setError(res.message || 'Lỗi import');
      }
    } catch {
      setError('Lỗi import');
    } finally {
      setImportLoading(false);
    }
  };

  const renderActions = (row) => (
    <div className="flex flex-wrap gap-1">
      <button className="btn btn-primary btn-xs" onClick={() => navigate(`/admin/users/view=${row.id}`)}>Xem</button>
      <button className="btn btn-warning btn-xs" onClick={() => navigate(`/admin/users/edit=${row.id}`)}>Sửa</button>
      <button className="btn btn-sm btn-ghost" onClick={() => handleToggleLock(row.id)}>
        {row.status === 'ACTIVE' ? 'Khóa' : 'Mở'}
      </button>
      {row.role !== 'ADMIN' && row.id !== currentUser.id && (
        <button className="btn btn-error btn-outline btn-xs" onClick={() => handleDeleteClick(row.id, row.full_name)}>Xóa</button>
      )}
    </div>
  );

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Quản lý Users</h1>
        </div>
        <button className="btn btn-primary btn-sm gap-1" onClick={() => setShowCreateForm(true)}>
          <Plus size={14} />
          Tạo user
        </button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadUsers(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa user"
        message={`Bạn có chắc chắn muốn xóa user "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="form-control flex-1">
          <input
            type="text"
            placeholder="Search theo tên, email, SĐT..."
            className="input input-bordered input-sm w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <select className="select select-bordered select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm gap-1" onClick={handleSearch}>
          <Search size={14} />
          Tìm
        </button>
        <button className="btn btn-ghost btn-sm gap-1" onClick={handleDownloadTemplate}>
          <FileSpreadsheet size={14} />
          Template
        </button>
        <button className="btn btn-ghost btn-sm gap-1" onClick={handleExport}>
          <Download size={14} />
          Export
        </button>
        <button className="btn btn-ghost btn-sm gap-1" onClick={openImport}>
          <Upload size={14} />
          Import
        </button>
      </div>

      {/* Import Modal */}
      {showImport && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Import Users từ Excel</h3>
            {importStep === 'upload' && (
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Chọn file Excel (.xlsx)</span>
                  </label>
                  <input type="file" accept=".xlsx,.xls" className="file-input file-input-bordered w-full" onChange={handleFileSelect} />
                </div>
                {importFile && (
                  <div className="alert alert-info">
                    <span>File: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setShowImport(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={handlePreviewImport} disabled={!importFile || importLoading}>
                    {importLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                    {importLoading ? 'Đang đọc...' : 'Xem trước'}
                  </button>
                </div>
              </div>
            )}
            {importStep === 'preview' && importPreview && (
              <div className="space-y-4">
                <div className="stats shadow w-full">
                  <div className="stat">
                    <div className="stat-title">Tổng dòng</div>
                    <div className="stat-value text-lg">{importPreview.totalRows}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-title text-success">Hợp lệ</div>
                    <div className="stat-value text-lg text-success">{importPreview.validRows}</div>
                  </div>
                  {importPreview.errorRows > 0 && (
                    <div className="stat">
                      <div className="stat-title text-error">Lỗi</div>
                      <div className="stat-value text-lg text-error">{importPreview.errorRows}</div>
                    </div>
                  )}
                </div>
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button className="btn btn-ghost" onClick={() => setShowImport(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} user`}
                  </button>
                </div>
              </div>
            )}
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowImport(false)}>close</button>
          </form>
        </dialog>
      )}

      {/* Create User Modal */}
      {showCreateForm && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-4">Tạo user mới</h3>
            <DynamicForm
              entity="users"
              formId={USERS_FORM_ID}
              onSubmit={handleCreateUser}
              initialData={{ role: 'USER', status: 'ACTIVE', password: '123456' }}
            >
              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>Hủy</button>
              </div>
            </DynamicForm>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowCreateForm(false)}>close</button>
          </form>
        </dialog>
      )}

      {popup.open && (
        <RecordDetailPopup
          entity="users"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={USERS_VIEW_ID}
          mode={popup.mode}
          onClose={() => navigate('/admin/users')}
          onSaved={() => loadUsers(pagination.page)}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/admin/users/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      <DynamicTable
        entity="users"
        viewId={USERS_VIEW_ID}
        data={users}
        actions={renderActions}
        startIndex={(pagination.page - 1) * pagination.limit}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={loadUsers}
      />
    </div>
  );
};

export default AdminUsersPage;
