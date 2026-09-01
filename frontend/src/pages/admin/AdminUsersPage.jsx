import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminUserService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';

const USERS_VIEW_ID = 7;

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

  useEffect(() => {
    loadUsers(1);
  }, []);

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
    <div className="action-buttons">
      <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/users/view=${row.id}`)}>Xem</button>
      <button className="btn btn-sm btn-edit" onClick={() => navigate(`/admin/users/edit=${row.id}`)}>Sửa</button>
      <button className="btn btn-sm btn-lock" onClick={() => handleToggleLock(row.id)}>
        {row.status === 'ACTIVE' ? 'Khóa' : 'Mở'}
      </button>
      {row.role !== 'ADMIN' && row.id !== currentUser.id && (
        <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(row.id, row.full_name)}>Xóa</button>
      )}
    </div>
  );

  return (
    <div className="admin-users-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Quản lý Users</h1>
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

      <div className="filter-bar">
        <input type="text" placeholder="Search theo tên, email, SĐT..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={handleSearch}>Tìm</button>
        <button className="btn btn-secondary" onClick={handleDownloadTemplate}>Template</button>
        <button className="btn btn-secondary" onClick={handleExport}>Export Excel</button>
        <button className="btn btn-secondary" onClick={openImport}>Import Excel</button>
      </div>

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Import Users từ Excel</h2>
            {importStep === 'upload' && (
              <div className="import-upload">
                <label>Chọn file Excel (.xlsx)</label>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                {importFile && (
                  <div className="import-file-info">
                    <p>File: <strong>{importFile.name}</strong></p>
                    <p>Kích thước: {(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                )}
                <div className="import-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImport(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary" onClick={handlePreviewImport} disabled={!importFile || importLoading}>
                    {importLoading ? 'Đang đọc...' : 'Xem trước'}
                  </button>
                </div>
              </div>
            )}
            {importStep === 'preview' && importPreview && (
              <div className="import-preview">
                <div className="import-summary">
                  <p>Tổng dòng: <strong>{importPreview.totalRows}</strong></p>
                  <p className="success-text">Hợp lệ: <strong>{importPreview.validRows}</strong></p>
                  {importPreview.errorRows > 0 && <p className="error-text">Lỗi: <strong>{importPreview.errorRows}</strong></p>}
                </div>
                <div className="import-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setImportStep('upload')}>Quay lại</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImport(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} user`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {popup.open && (
        <RecordDetailPopup
          entity="users"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={USERS_VIEW_ID}
          mode={popup.mode}
          onClose={() => navigate('/admin/users')}
          onSaved={() => { loadUsers(pagination.page); navigate('/admin/users'); }}
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
