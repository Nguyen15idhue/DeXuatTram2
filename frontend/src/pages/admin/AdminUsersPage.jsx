import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminUserService, excelService } from '../../services/api';
import DynamicTable from '../../components/dynamic/DynamicTable';
import DynamicForm from '../../components/dynamic/DynamicForm';
import Loading from '../../components/Loading';
import RecordDetailPopup from '../../components/admin/RecordDetailPopup';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorMessage from '../../components/ErrorMessage';
import Pagination from '../../components/Pagination';
import useFieldOptions from '../../hooks/useFieldOptions';
import { Users, Plus, Search, Download, Upload, FileSpreadsheet, RotateCcw, X, Trash2 } from 'lucide-react';

const USERS_VIEW_ID = 7;
const USERS_FORM_ID = 15;
const USERS_PAGE_SIZE = 10;

const ROLE_RANK = { SUPER_ADMIN: 0, ADMIN: 1, SALES: 2, CTV: 3 };

const AdminUsersPage = () => {
  const { token, user: currentUser, isSuperAdmin, isSales } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSelectOptions } = useFieldOptions('users');
  const statusOptions = getSelectOptions('status');
  const roleOptions = getSelectOptions('role');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [popup, setPopup] = useState({ open: false, record: null, mode: 'view' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const createRoleAllowlist = isSales ? ['CTV'] : (!isSuperAdmin ? ['CTV', 'SALES', 'ADMIN'] : null);
  const [pwModal, setPwModal] = useState({ open: false, id: null, name: '' });
  const [pwOld, setPwOld] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

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
      const res = await adminUserService.getById(id, token);
      if (res.success) {
        setPopup({ open: true, record: res.data, mode });
      }
    } catch { /* silent */ }
  };

  const loadUsers = useCallback(async (overrides = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ all: '1' });
      const st = overrides.filterStatus !== undefined ? overrides.filterStatus : filterStatus;
      if (st) params.append('status', st);
      const res = await adminUserService.getAllWithParams(params.toString(), token);
      if (res.success) {
        setUsers(res.data);
      }
    } catch {
      setError('Lỗi tải danh sách users');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSearch = () => { setAppliedSearch(search); };

  const treeRows = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();
    let list = users;
    if (q) {
      const match = (u) => [u.full_name, u.email, u.phone, u.external_id].some(v => (v || '').toLowerCase().includes(q));
      const byId = {};
      users.forEach(u => { byId[u.id] = u; });
      const keep = new Set();
      users.forEach(u => {
        if (match(u)) {
          keep.add(u.id);
          let p = u.parent_id;
          while (p && byId[p] && !keep.has(p)) { keep.add(p); p = byId[p].parent_id; }
        }
      });
      list = users.filter(u => keep.has(u.id));
    }
    const inList = new Set(list.map(u => u.id));
    const children = {};
    const roots = [];
    list.forEach(u => {
      if (u.parent_id && inList.has(u.parent_id)) {
        (children[u.parent_id] = children[u.parent_id] || []).push(u);
      } else {
        roots.push(u);
      }
    });
    const sortFn = (a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) || (a.full_name || '').localeCompare(b.full_name || '');
    roots.sort(sortFn);
    Object.values(children).forEach(arr => arr.sort(sortFn));
    const rows = [];
    const walk = (nodes, depth) => {
      nodes.forEach(n => {
        rows.push({ user: n, depth });
        if (children[n.id]) walk(children[n.id], depth + 1);
      });
    };
    walk(roots, 0);
    return rows;
  }, [users, appliedSearch]);

  const totalPages = Math.max(1, Math.ceil(treeRows.length / USERS_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [appliedSearch, filterStatus]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedRows = useMemo(
    () => treeRows.slice((page - 1) * USERS_PAGE_SIZE, page * USERS_PAGE_SIZE),
    [treeRows, page]
  );

  const handleReset = () => {
    setSearch('');
    setFilterStatus('');
    setAppliedSearch('');
    setError('');
    loadUsers({ filterStatus: '' });
  };

  const handleDeleteClick = (id, name) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const openPasswordModal = (id, name) => {
    setPwModal({ open: true, id, name });
    setPwOld('');
    setPw1('');
    setPw2('');
    setPwError('');
  };

  const handleChangePassword = async () => {
    if (pwModal.id === currentUser.id && !pwOld) { setPwError('Vui lòng nhập mật khẩu hiện tại'); return; }
    if (!pw1 || pw1.length < 6) { setPwError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    if (pw1 !== pw2) { setPwError('Nhập lại mật khẩu chưa khớp'); return; }
    try {
      setPwLoading(true);
      const res = await adminUserService.changePassword(pwModal.id, pw1, token, pwModal.id === currentUser.id ? pwOld : undefined);
      if (res.success) {
        setPwModal({ open: false, id: null, name: '' });
        setToast({ message: 'Đổi mật khẩu thành công', type: 'success' });
      } else {
        setPwError(res.message || 'Đổi mật khẩu thất bại');
      }
    } catch {
      setPwError('Lỗi kết nối server');
    } finally {
      setPwLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await adminUserService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa user thành công', type: 'success' });
        loadUsers();
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setConfirmBulkDelete(false);
    setBulkLoading(true);
    const deletable = [];
    const skipped = [];
    selectedIds.forEach((id) => {
      const u = users.find(x => x.id === id);
      if (!u || ['ADMIN', 'SUPER_ADMIN'].includes(u.role) || u.id === currentUser.id) {
        skipped.push(`#${id}${u ? ` (${u.full_name || u.email || ''})` : ''}`);
      } else {
        deletable.push(id);
      }
    });
    let ok = 0;
    const failed = [];
    for (const id of deletable) {
      try {
        const res = await adminUserService.delete(id, token);
        if (res.success) ok++;
        else failed.push(`#${id}: ${res.message || 'Xóa thất bại'}`);
      } catch {
        failed.push(`#${id}: Lỗi kết nối server`);
      }
    }
    setBulkLoading(false);
    setSelectedIds([]);
    loadUsers();
    const parts = [];
    if (ok > 0) parts.push(`Đã xóa ${ok} user`);
    if (skipped.length > 0) parts.push(`bỏ qua ${skipped.length} (admin/tự): ${skipped.join('; ')}`);
    if (failed.length > 0) parts.push(`${failed.length} không xóa được: ${failed.join('; ')}`);
    if (ok > 0) {
      setToast({ message: parts.join('; '), type: (skipped.length > 0 || failed.length > 0) ? 'warning' : 'success' });
    } else {
      setError(parts.join('; ') || 'Không xóa được user nào');
    }
  };

  const handleToggleLock = async (id) => {
    try {
      const res = await adminUserService.toggleLock(id, token);
      if (res.success) {
        setToast({ message: res.message, type: 'success' });
        loadUsers();
      } else {
        setError(res.message || 'Không thể khóa/mở tài khoản');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleExport = async () => {
    try {
      await excelService.exportData('users', token, { search: appliedSearch, status: filterStatus });
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
      role: formData.role === 'USER' ? 'CTV' : (formData.role || 'CTV'),
      status: formData.status || 'ACTIVE',
      external_id: formData.external_id || null
    };
    const customData = {};
    const fixedKeys = ['full_name', 'email', 'phone', 'password', 'role', 'status', 'external_id'];
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
      loadUsers();
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
        loadUsers();
      } else {
        setError(res.message || 'Lỗi import');
      }
    } catch {
      setError('Lỗi import');
    } finally {
      setImportLoading(false);
    }
  };

  const renderActions = (row) => {
    const isSuperRow = row.role === 'SUPER_ADMIN';
    const canManage = isSuperAdmin || !isSuperRow;
    return (
      <div className="flex flex-wrap gap-1">
        <button className="btn btn-primary btn-xs" onClick={() => navigate(`/admin/users/view=${row.id}`)}>Xem</button>
        {canManage && (
          <button className="btn btn-warning btn-xs" onClick={() => navigate(`/admin/users/edit=${row.id}`)}>Sửa</button>
        )}
        {canManage && (
          <button className="btn btn-ghost btn-xs" onClick={() => openPasswordModal(row.id, row.full_name)}>Đổi MK</button>
        )}
        {canManage && !isSales && row.id !== currentUser.id && (
          <button className="btn btn-sm btn-ghost" onClick={() => handleToggleLock(row.id)}>
            {row.status === 'ACTIVE' ? 'Khóa' : 'Mở'}
          </button>
        )}
        {!['ADMIN', 'SUPER_ADMIN'].includes(row.role) && row.id !== currentUser.id && (
          <button className="btn btn-error btn-outline btn-xs" onClick={() => handleDeleteClick(row.id, row.full_name)}>Xóa</button>
        )}
      </div>
    );
  };

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

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadUsers(); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa user"
        message={`Bạn có chắc chắn muốn xóa user "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        title="Xóa nhiều user"
        message={`Bạn có chắc chắn muốn xóa ${selectedIds.length} user đã chọn? (Tài khoản admin và chính bạn sẽ được bỏ qua)`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
        confirmText="Xóa"
        type="danger"
      />

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="form-control flex-1">
          <input
            type="text"
            placeholder="Search theo tên, email, SĐT, mã ngoài..."
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
        <button className="btn btn-ghost btn-sm gap-1" onClick={handleReset}>
          <RotateCcw size={14} />
          Reset
        </button>
        {!isSales && (
          <button className="btn btn-ghost btn-sm gap-1" onClick={handleDownloadTemplate}>
            <FileSpreadsheet size={14} />
            Template
          </button>
        )}
        {!isSales && (
          <button className="btn btn-ghost btn-sm gap-1" onClick={handleExport}>
            <Download size={14} />
            Export
          </button>
        )}
        {!isSales && (
          <button className="btn btn-ghost btn-sm gap-1" onClick={openImport}>
            <Upload size={14} />
            Import
          </button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 bg-base-200 rounded-lg">
          <span className="text-sm font-medium">Đã chọn: {selectedIds.length} user</span>
          <button className="btn btn-error btn-sm gap-1" onClick={() => setConfirmBulkDelete(true)} disabled={bulkLoading}>
            <Trash2 size={14} /> Xóa ({selectedIds.length})
          </button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => setSelectedIds([])}>
            <X size={14} /> Bỏ chọn
          </button>
        </div>
      )}

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
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Tạo user mới</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowCreateForm(false)}>
                <X size={18} />
              </button>
            </div>
            <DynamicForm
              entity="users"
              purpose="create"
              formId={USERS_FORM_ID}
              onSubmit={handleCreateUser}
              initialData={{ role: 'CTV', status: 'ACTIVE' }}
              optionAllowlist={createRoleAllowlist ? { role: createRoleAllowlist } : {}}
            >
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>Hủy</button>
            </DynamicForm>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowCreateForm(false)}>close</button>
          </form>
        </dialog>
      )}

      {pwModal.open && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Đổi mật khẩu — {pwModal.name}</h3>
            <div className="space-y-4">
              {pwModal.id === currentUser.id && (
              <div className="form-control">
                <label className="label"><span className="label-text">Mật khẩu hiện tại</span></label>
                <input type="password" autoComplete="current-password" className="input input-bordered w-full" value={pwOld} onChange={(e) => setPwOld(e.target.value)} />
              </div>
              )}
              <div className="form-control">
                <label className="label"><span className="label-text">Mật khẩu mới (ít nhất 6 ký tự)</span></label>
                <input type="password" autoComplete="new-password" className="input input-bordered w-full" value={pw1} onChange={(e) => setPw1(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Nhập lại mật khẩu mới</span></label>
                <input type="password" autoComplete="new-password" className="input input-bordered w-full" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </div>
              {pwError && <div className="alert alert-error"><span>{pwError}</span></div>}
              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => setPwModal({ open: false, id: null, name: '' })}>Hủy</button>
                <button className="btn btn-primary" onClick={handleChangePassword} disabled={pwLoading}>
                  {pwLoading ? 'Đang lưu...' : 'Đổi mật khẩu'}
                </button>
              </div>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setPwModal({ open: false, id: null, name: '' })}>close</button>
          </form>
        </dialog>
      )}

      {popup.open && (
        <RecordDetailPopup          entity="users"
          record={popup.record}
          recordId={popup.record ? undefined : parseInt(location.pathname.match(/=(\d+)/)?.[1])}
          viewId={USERS_VIEW_ID}
          mode={popup.mode}
          onClose={() => {
            setPopup({ open: false, record: null, mode: 'view' });
            navigate('/admin/users');
          }}
          onSaved={() => loadUsers()}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/admin/users/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          <DynamicTable
            entity="users"
            viewId={USERS_VIEW_ID}
            data={pagedRows.map(({ user, depth }) => ({ ...user, _depth: depth }))}
            actions={renderActions}
            startIndex={(page - 1) * USERS_PAGE_SIZE}
            rowDepth={(row) => row._depth || 0}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            total={treeRows.length}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
};

export default AdminUsersPage;
