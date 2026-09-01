import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { dataListService, excelService } from '../../services/api';
import Loading from '../Loading';
import Toast from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import EmptyState from '../EmptyState';
import ErrorMessage from '../ErrorMessage';
import Pagination from '../Pagination';

const DataListManager = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [form, setForm] = useState({ name: '', description: '', columns_config: [{ key: '', label: '', type: 'text' }] });
  const [editingId, setEditingId] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [showImport, setShowImport] = useState(false);
  const [importListId, setImportListId] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState('upload');

  const loadLists = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await dataListService.getAll(`page=${page}&limit=10`, token);
      if (res && res.success) {
        setLists(res.data || []);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      } else {
        setError(res?.message || 'Lỗi tải danh sách');
      }
    } catch (err) {
      console.error('Load data lists error:', err);
      setError('Lỗi tải danh sách: ' + (err?.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadLists(1); }, [loadLists]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', description: '', columns_config: [{ key: '', label: '', type: 'text' }] });
    setShowForm(true);
    setError('');
  };

  const openEdit = (list) => {
    setEditingId(list.id);
    setForm({
      name: list.name,
      description: list.description || '',
      columns_config: list.columns_config || [{ key: '', label: '', type: 'text' }]
    });
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Tên danh sách không được để trống');
      return;
    }
    if (!form.columns_config.length || form.columns_config.some(c => !c.key || !c.label)) {
      setError('Cần ít nhất 1 column với key và label');
      return;
    }
    try {
      let res;
      if (editingId) {
        res = await dataListService.update(editingId, form, token);
      } else {
        res = await dataListService.create(form, token);
      }
      if (res.success) {
        setToast({ message: editingId ? 'Cập nhật thành công' : 'Tạo thành công', type: 'success' });
        setShowForm(false);
        loadLists(pagination.page);
      } else {
        setError(res.message || 'Thao tác thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDelete = async () => {
    try {
      const res = await dataListService.remove(confirmDelete.id, token);
      if (res.success) {
        setToast({ message: 'Xóa thành công', type: 'success' });
        loadLists(pagination.page);
      } else {
        setToast({ message: res.message || 'Xóa thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi server', type: 'error' });
    }
    setConfirmDelete({ isOpen: false, id: null, name: '' });
  };

  const handleExportDataList = async (listId) => {
    try {
      await excelService.exportDataList(listId, token);
      setToast({ message: 'Export thành công', type: 'success' });
    } catch {
      setToast({ message: 'Lỗi export', type: 'error' });
    }
  };

  const openImportDataList = (listId) => {
    setImportListId(listId);
    setShowImport(true);
    setImportFile(null);
    setImportPreview(null);
    setImportStep('upload');
    setError('');
  };

  const handleDLFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImportFile(file);
      setImportPreview(null);
      setImportStep('upload');
    }
  };

  const handleDLPreviewImport = async () => {
    if (!importFile) { setError('Vui lòng chọn file Excel'); return; }
    try {
      setImportLoading(true);
      const res = await excelService.previewDataListImport(importListId, importFile, token);
      if (res.success) {
        setImportPreview(res.data);
        setImportStep('preview');
      } else {
        setError(res.message || 'Lỗi đọc file Excel');
      }
    } catch {
      setError('Lỗi đọc file Excel');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDLConfirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) { setError('Không có dữ liệu hợp lệ để import'); return; }
    try {
      setImportLoading(true);
      const res = await excelService.confirmDataListImport(importListId, importPreview.rows, token);
      if (res.success) {
        setShowImport(false);
        setToast({ message: res.message, type: 'success' });
        loadLists(pagination.page);
      } else {
        setError(res.message || 'Lỗi import');
      }
    } catch {
      setError('Lỗi import');
    } finally {
      setImportLoading(false);
    }
  };

  const addColumn = () => {
    setForm({ ...form, columns_config: [...form.columns_config, { key: '', label: '', type: 'text' }] });
  };

  const updateColumn = (index, field, value) => {
    const cols = [...form.columns_config];
    cols[index] = { ...cols[index], [field]: value };
    setForm({ ...form, columns_config: cols });
  };

  const removeColumn = (index) => {
    if (form.columns_config.length <= 1) return;
    setForm({ ...form, columns_config: form.columns_config.filter((_, i) => i !== index) });
  };

  if (loading && lists.length === 0) return <Loading message="Đang tải danh sách..." />;

  return (
    <div className="admin-data-lists-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Danh mục dữ liệu (Data Lists)</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Tạo mới</button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadLists(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa data list"
        message={`Bạn có chắc chắn muốn xóa "${confirmDelete.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h2>{editingId ? 'Sửa danh sách' : 'Tạo danh sách mới'}</h2>
            <form onSubmit={handleSubmit}>
              {error && <ErrorMessage message={error} />}
              <div className="field-form">
                <div className="form-group">
                  <label>Tên danh sách *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="VD: Tỉnh Huyện Xã" />
                </div>
                <div className="form-group">
                  <label>Mô tả</label>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group-section">
                  <h4>Columns (cấu trúc dữ liệu)</h4>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={addColumn} style={{ marginBottom: 8 }}>+ Thêm column</button>
                  {form.columns_config.map((col, i) => (
                    <div key={i} className="form-row" style={{ alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <input type="text" value={col.key} onChange={e => updateColumn(i, 'key', e.target.value)} placeholder="key (vd: tinh)" style={{ flex: 1 }} />
                      <input type="text" value={col.label} onChange={e => updateColumn(i, 'label', e.target.value)} placeholder="Label (vd: Tỉnh)" style={{ flex: 1 }} />
                      <select value={col.type} onChange={e => updateColumn(i, 'type', e.target.value)} style={{ padding: '6px 8px' }}>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                      </select>
                      {col.type === 'number' && (
                        <select value={col.number_format || 'plain'} onChange={e => updateColumn(i, 'number_format', e.target.value)} style={{ padding: '6px 8px' }} title="Định dạng số">
                          <option value="plain">1000</option>
                          <option value="comma">1,000</option>
                          <option value="dot">1.000</option>
                          <option value="space">1 000</option>
                        </select>
                      )}
                      {form.columns_config.length > 1 && (
                        <button type="button" className="btn btn-sm btn-delete" onClick={() => removeColumn(i)}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Cập nhật' : 'Tạo mới'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Import Data List từ Excel</h2>
            {importStep === 'upload' && (
              <div className="import-upload">
                <label>Chọn file Excel (.xlsx)</label>
                <input type="file" accept=".xlsx,.xls" onChange={handleDLFileSelect} />
                {importFile && (
                  <div className="import-file-info">
                    <p>File: <strong>{importFile.name}</strong></p>
                    <p>Kích thước: {(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                )}
                <div className="import-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImport(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary" onClick={handleDLPreviewImport} disabled={!importFile || importLoading}>
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
                  <button type="button" className="btn btn-primary" onClick={handleDLConfirmImport} disabled={importPreview.rows.length === 0 || importLoading}>
                    {importLoading ? 'Đang import...' : `Import ${importPreview.validRows} dòng`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên</th>
              <th>Mô tả</th>
              <th>Columns</th>
              <th>Rows</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {lists.length === 0 ? (
              <tr><td colSpan="6"><EmptyState icon="📋" title="Không có data list" description="Thêm data list để bắt đầu" /></td></tr>
            ) : lists.map((list, idx) => (
              <tr key={list.id}>
                <td>{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td><strong>{list.name}</strong></td>
                <td>{list.description || '—'}</td>
                <td>{(list.columns_config || []).map(c => c.label).join(', ')}</td>
                <td>{list.row_count || 0}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-sm btn-edit" onClick={() => openEdit(list)}>Sửa</button>
                    <button className="btn btn-sm btn-primary" onClick={() => navigate(`/admin/data-lists/${list.id}`)}>Dữ liệu</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleExportDataList(list.id)}>Export</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => openImportDataList(list.id)}>Import</button>
                    <button className="btn btn-sm btn-delete" onClick={() => setConfirmDelete({ isOpen: true, id: list.id, name: list.name })}>Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={loadLists}
        />
      )}
    </div>
  );
};

export default DataListManager;
