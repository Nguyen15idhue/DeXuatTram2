import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldDefinitionService } from '../../services/api';
import Loading from '../Loading';
import Toast from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import EmptyState from '../EmptyState';
import ErrorMessage from '../ErrorMessage';
import Pagination from '../Pagination';

const FIELD_TYPES = ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'file', 'formula'];
const ENTITIES = ['stations', 'station_proposals', 'users'];
const BORDER_RADIUS_OPTIONS = ['square', 'rounded-sm', 'rounded', 'rounded-full'];
const DATE_FORMAT_OPTIONS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD-MM-YYYY', 'YYYY/MM/DD'];

const COLOR_PALETTE = [
  { label: 'Xanh lá đậm', value: '#166534' },
  { label: 'Xanh lá', value: '#16a34a' },
  { label: 'Xanh lá nhạt', value: '#4ade80' },
  { label: 'Xanh lá rất nhạt', value: '#bbf7d0' },
  { label: 'Xanh dương đậm', value: '#1e40af' },
  { label: 'Xanh dương', value: '#3b82f6' },
  { label: 'Xanh dương nhạt', value: '#60a5fa' },
  { label: 'Xanh dương rất nhạt', value: '#bfdbfe' },
  { label: 'Đỏ đậm', value: '#991b1b' },
  { label: 'Đỏ', value: '#dc2626' },
  { label: 'Đỏ nhạt', value: '#f87171' },
  { label: 'Đỏ rất nhạt', value: '#fecaca' },
  { label: 'Vàng đậm', value: '#854d0e' },
  { label: 'Vàng', value: '#eab308' },
  { label: 'Vàng nhạt', value: '#facc15' },
  { label: 'Vàng rất nhạt', value: '#fef08a' },
  { label: 'Cam đậm', value: '#9a3412' },
  { label: 'Cam', value: '#ea580c' },
  { label: 'Cam nhạt', value: '#fb923c' },
  { label: 'Cam rất nhạt', value: '#fed7aa' },
  { label: 'Đen', value: '#1f2937' },
  { label: 'Xám đậm', value: '#6b7280' },
  { label: 'Xám', value: '#9ca3af' },
  { label: 'Xám nhạt', value: '#d1d5db' },
];

const FieldManager = () => {
  const { token } = useAuth();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [editingId, setEditingId] = useState(null);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const defaultForm = {
    entity: 'stations', key: '', label: '', type: 'text', source_type: 'json',
    required: false, placeholder: '', help_text: '',
    number_format: 'integer', decimal_places: 0,
    date_format: 'DD/MM/YYYY',
    options: [],
    option_style: { defaultColor: '#666666', defaultBorderRadius: 'rounded' },
    file_config: { images: true, videos: false, documents: true, maxSize: 5, multiple: false },
    formula_config: { expression: '', referencedFields: [] }
  };
  const [form, setForm] = useState(defaultForm);

  const loadFields = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filterEntity) params.append('entity', filterEntity);
      if (filterStatus) params.append('status', filterStatus);
      const res = await fieldDefinitionService.getAll(params.toString(), token);
      if (res.success) {
        setFields(res.data);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      }
    } catch {
      setError('Lỗi tải danh sách field definitions');
    } finally {
      setLoading(false);
    }
  }, [filterEntity, filterStatus, token]);

  useEffect(() => { loadFields(1); }, [loadFields]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm, entity: filterEntity || 'stations' });
    setShowForm(true);
    setError('');
  };

  const openEdit = (field) => {
    setEditingId(field.id);
    let parsedOptions = [];
    if (field.options) {
      try {
        const parsed = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
        parsedOptions = Array.isArray(parsed) ? parsed : [];
      } catch { parsedOptions = []; }
    }
    let parsedOptionStyle = { defaultColor: '#666666', defaultBorderRadius: 'rounded' };
    if (field.option_style) {
      try {
        parsedOptionStyle = typeof field.option_style === 'string' ? JSON.parse(field.option_style) : field.option_style;
      } catch {}
    }
    let parsedFileConfig = { images: true, videos: false, documents: true, maxSize: 5, multiple: false };
    if (field.file_config) {
      try {
        parsedFileConfig = typeof field.file_config === 'string' ? JSON.parse(field.file_config) : field.file_config;
      } catch {}
    }
    let parsedFormulaConfig = { expression: '', referencedFields: [] };
    if (field.formula_config) {
      try {
        parsedFormulaConfig = typeof field.formula_config === 'string' ? JSON.parse(field.formula_config) : field.formula_config;
      } catch {}
    }
    setForm({
      entity: field.entity, key: field.key, label: field.label, type: field.type,
      source_type: field.source_type || 'json', required: !!field.required,
      placeholder: field.placeholder || '', help_text: field.help_text || '',
      number_format: field.number_format || 'integer',
      decimal_places: field.decimal_places ?? 0,
      date_format: field.date_format || 'DD/MM/YYYY',
      options: parsedOptions,
      option_style: parsedOptionStyle,
      file_config: parsedFileConfig,
      formula_config: parsedFormulaConfig
    });
    setShowForm(true);
    setError('');
  };

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateFileConfig = (key, value) => {
    setForm(prev => ({ ...prev, file_config: { ...prev.file_config, [key]: value } }));
  };

  const updateOptionStyle = (key, value) => {
    setForm(prev => ({ ...prev, option_style: { ...prev.option_style, [key]: value } }));
  };

  const addOption = () => {
    setForm(prev => ({
      ...prev,
      options: [...prev.options, { label: '', value: '', color: '#666666', borderRadius: 'rounded' }]
    }));
  };

  const updateOption = (index, key, value) => {
    setForm(prev => {
      const newOptions = [...prev.options];
      newOptions[index] = { ...newOptions[index], [key]: value };
      return { ...prev, options: newOptions };
    });
  };

  const removeOption = (index) => {
    setForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.entity || !form.key || !form.label) {
      setError('Vui lòng nhập đầy đủ entity, key, label');
      return;
    }
    const payload = {
      entity: form.entity, key: form.key, label: form.label, type: form.type,
      source_type: form.source_type, required: form.required ? 1 : 0,
      placeholder: form.placeholder, help_text: form.help_text
    };
    if (form.type === 'number') {
      payload.number_format = form.number_format;
      payload.decimal_places = form.decimal_places;
    }
    if (form.type === 'date' || form.type === 'datetime') {
      payload.date_format = form.date_format;
    }
    if (form.type === 'select' || form.type === 'multiselect') {
      payload.options = form.options.length > 0 ? form.options : null;
      payload.option_style = form.option_style;
    }
    if (form.type === 'file') {
      payload.file_config = form.file_config;
    }
    if (form.type === 'formula') {
      payload.formula_config = form.formula_config;
    }
    try {
      let res;
      if (editingId) {
        res = await fieldDefinitionService.update(editingId, payload, token);
      } else {
        res = await fieldDefinitionService.create(payload, token);
      }
      if (res.success) {
        setToast({ message: editingId ? 'Cập nhật field thành công' : 'Tạo field thành công', type: 'success' });
        setShowForm(false);
        loadFields(pagination.page);
      } else {
        setError(res.message || 'Thao tác thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id, label) => {
    setConfirmDelete({ isOpen: true, id, name: label });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await fieldDefinitionService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa field thành công', type: 'success' });
        loadFields(pagination.page);
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const res = await fieldDefinitionService.updateStatus(id, newStatus, token);
      if (res.success) {
        setToast({ message: `Field đã chuyển sang ${newStatus}`, type: 'success' });
        loadFields(pagination.page);
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading && fields.length === 0) return <Loading message="Đang tải field definitions..." />;

  return (
    <div className="admin-fields-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <h1>Field Definitions</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Thêm field</button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadFields(1); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa field"
        message={`Bạn có chắc chắn muốn xóa field "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h2>{editingId ? 'Sửa field' : 'Thêm field mới'}</h2>
            <form onSubmit={handleSubmit}>
              {error && <ErrorMessage message={error} />}
              <div className="field-form">
                <div className="form-group">
                  <label>Entity *</label>
                  <select value={form.entity} onChange={(e) => updateForm('entity', e.target.value)}>
                    {ENTITIES.map(en => <option key={en} value={en}>{en}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Key * {editingId && <span style={{ color: '#999', fontWeight: 'normal', fontSize: 12 }}>(không thể thay đổi)</span>}</label>
                  <input type="text" value={form.key} onChange={(e) => updateForm('key', e.target.value)} placeholder="vi_du_field" disabled={!!editingId} />
                </div>
                <div className="form-group">
                  <label>Label *</label>
                  <input type="text" value={form.label} onChange={(e) => updateForm('label', e.target.value)} placeholder="Tên hiển thị" />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => updateForm('type', e.target.value)}>
                    {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Placeholder</label>
                  <input type="text" value={form.placeholder} onChange={(e) => updateForm('placeholder', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Help Text</label>
                  <input type="text" value={form.help_text} onChange={(e) => updateForm('help_text', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={form.required} onChange={(e) => updateForm('required', e.target.checked)} style={{ marginRight: 6 }} />
                    Bắt buộc
                  </label>
                </div>

                {(form.type === 'number') && (
                  <div className="form-group-section">
                    <h4>Cấu hình Number</h4>
                    <div className="form-group">
                      <label>Number Format</label>
                      <select value={form.number_format} onChange={(e) => updateForm('number_format', e.target.value)}>
                        <option value="integer">Integer (số nguyên)</option>
                        <option value="float">Float (số thập phân)</option>
                        <option value="currency">Currency (tiền tệ)</option>
                      </select>
                    </div>
                    {form.number_format !== 'integer' && (
                      <div className="form-group">
                        <label>Decimal Places</label>
                        <input type="number" min="0" max="10" value={form.decimal_places} onChange={(e) => updateForm('decimal_places', parseInt(e.target.value) || 0)} />
                      </div>
                    )}
                  </div>
                )}

                {(form.type === 'date' || form.type === 'datetime') && (
                  <div className="form-group-section">
                    <h4>Cấu hình Date</h4>
                    <div className="form-group">
                      <label>Date Format</label>
                      <select value={form.date_format} onChange={(e) => updateForm('date_format', e.target.value)}>
                        {DATE_FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {(form.type === 'select' || form.type === 'multiselect') && (
                  <div className="form-group-section">
                    <h4>Options</h4>
                    <div className="options-editor">
                      {form.options.map((opt, idx) => (
                        <div key={idx} className="option-row">
                          <input type="text" placeholder="Label" value={opt.label} onChange={(e) => updateOption(idx, 'label', e.target.value)} />
                          <input type="text" placeholder="Value" value={opt.value} onChange={(e) => updateOption(idx, 'value', e.target.value)} />
                          <div className="color-select" title="Màu sắc">
                            <div className="color-selected" style={{ backgroundColor: opt.color || '#666666' }} />
                            <div className="color-dropdown">
                              {COLOR_PALETTE.map(c => (
                                <div
                                  key={c.value}
                                  className="color-option"
                                  style={{ backgroundColor: c.value }}
                                  title={c.label}
                                  onClick={() => updateOption(idx, 'color', c.value)}
                                />
                              ))}
                            </div>
                          </div>
                          <select value={opt.borderRadius || 'rounded'} onChange={(e) => updateOption(idx, 'borderRadius', e.target.value)}>
                            {BORDER_RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button type="button" className="btn btn-sm btn-delete" onClick={() => removeOption(idx)}>✕</button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-sm btn-secondary" onClick={addOption}>+ Thêm option</button>
                    </div>
                    <h4>Option Style</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Default Color</label>
                        <div className="color-select">
                          <div className="color-selected" style={{ backgroundColor: form.option_style.defaultColor }} />
                          <div className="color-dropdown">
                            {COLOR_PALETTE.map(c => (
                              <div
                                key={c.value}
                                className="color-option"
                                style={{ backgroundColor: c.value }}
                                title={c.label}
                                onClick={() => updateOptionStyle('defaultColor', c.value)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Default Border Radius</label>
                        <select value={form.option_style.defaultBorderRadius} onChange={(e) => updateOptionStyle('defaultBorderRadius', e.target.value)}>
                          {BORDER_RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {(form.type === 'file') && (
                  <div className="form-group-section">
                    <h4>Cấu hình File</h4>
                    <div className="form-row">
                      <label>
                        <input type="checkbox" checked={form.file_config.images} onChange={(e) => updateFileConfig('images', e.target.checked)} style={{ marginRight: 4 }} />
                        Images
                      </label>
                      <label>
                        <input type="checkbox" checked={form.file_config.videos} onChange={(e) => updateFileConfig('videos', e.target.checked)} style={{ marginRight: 4 }} />
                        Videos
                      </label>
                      <label>
                        <input type="checkbox" checked={form.file_config.documents} onChange={(e) => updateFileConfig('documents', e.target.checked)} style={{ marginRight: 4 }} />
                        Documents
                      </label>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Max Size (MB)</label>
                        <input type="number" min="1" max="100" value={form.file_config.maxSize} onChange={(e) => updateFileConfig('maxSize', parseInt(e.target.value) || 5)} />
                      </div>
                      <div className="form-group">
                        <label>
                          <input type="checkbox" checked={form.file_config.multiple} onChange={(e) => updateFileConfig('multiple', e.target.checked)} style={{ marginRight: 4 }} />
                          Multiple files
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {(form.type === 'formula') && (
                  <div className="form-group-section">
                    <h4>Cấu hình Formula</h4>
                    <div className="form-group full-width">
                      <label>Formula Expression</label>
                      <textarea value={form.formula_config.expression} onChange={(e) => updateForm('formula_config', { ...form.formula_config, expression: e.target.value })} placeholder="VD: price * quantity * (1 - discount)" rows={3} />
                    </div>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Cập nhật' : 'Tạo mới'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}>
          <option value="">Tất cả entity</option>
          {ENTITIES.map(en => <option key={en} value={en}>{en}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Entity</th>
              <th>Key</th>
              <th>Label</th>
              <th>Type</th>
              <th>Required</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 ? (
              <tr><td colSpan="8"><EmptyState icon="📋" title="Không có field nào" description="Thêm field definitions để bắt đầu" /></td></tr>
            ) : fields.map((f, idx) => (
              <tr key={f.id}>
                <td>{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                <td><span className="field-entity-badge">{f.entity}</span></td>
                <td>
                  <code>{f.key}</code>
                  {f.source_type === 'fixed' && <span className="badge badge-fixed" title="Field cố định">🔒</span>}
                </td>
                <td>{f.label}</td>
                <td><span className="field-type-badge">{f.type}</span></td>
                <td>{f.required ? '✓' : ''}</td>
                <td>
                  <span className={`badge badge-${f.status === 'active' ? 'active' : 'inactive'}`} style={{ cursor: 'pointer' }} onClick={() => handleToggleStatus(f.id, f.status)}>
                    {f.status}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-sm btn-edit" onClick={() => openEdit(f)}>Sửa</button>
                    {f.source_type !== 'fixed' && (
                      <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(f.id, f.label)}>Xóa</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.pagination?.totalPages || pagination.totalPages}
        total={pagination.pagination?.total || pagination.total}
        onPageChange={loadFields}
      />
    </div>
  );
};

export default FieldManager;
