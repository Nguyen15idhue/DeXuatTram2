import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldDefinitionService, formService, formFieldService } from '../../services/api';
import Toast from '../Toast';
import ErrorMessage from '../ErrorMessage';

const ENTITIES = ['stations', 'station_proposals', 'users'];
const COL_OPTIONS = [
  { value: '1:1', label: '1:1 — 1 cột (Desktop & Mobile)' },
  { value: '1:2', label: '1:2 — 2 cột Desktop, 1 cột Mobile' }
];

const FormBuilder = ({ formId, onSaved }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [entity, setEntity] = useState('stations');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [availableFields, setAvailableFields] = useState([]);
  const [assignedFields, setAssignedFields] = useState([]);
  const [layoutConfig, setLayoutConfig] = useState({ rows: [] });
  const [selectedField, setSelectedField] = useState(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [dragOverCell, setDragOverCell] = useState(null);

  useEffect(() => {
    if (formId) loadFormConfig();
  }, [formId]);

  const loadFormConfig = async () => {
    try {
      setLoading(true);
      const formRes = await formService.getById(formId);
      if (formRes.success) {
        setEntity(formRes.data.entity);
        setFormName(formRes.data.name);
        setFormDesc(formRes.data.description || '');
        if (formRes.data.layout_config) {
          setLayoutConfig(typeof formRes.data.layout_config === 'string'
            ? JSON.parse(formRes.data.layout_config)
            : formRes.data.layout_config);
        }
        await loadAvailableFields(formRes.data.entity);
        const fieldsRes = await formFieldService.getByForm(formId);
        if (fieldsRes.success) {
          setAssignedFields(fieldsRes.data.map(f => {
            const cfg = f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) : {};
            return {
              id: f.id,
              fieldId: f.field_id,
              label: f.field_label || f.label,
              key: f.field_key || f.key,
              type: f.field_type || f.type,
              orderIndex: f.order_index,
              visible: !!f.visible,
              config: cfg
            };
          }));
        }
      }
    } catch {
      setError('Lỗi tải cấu hình form');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableFields = async (ent) => {
    try {
      const res = await fieldDefinitionService.getByEntity(ent);
      if (res.success) {
        setAvailableFields(res.data || []);
      }
    } catch {
      setError('Lỗi tải field definitions');
    }
  };

  const handleEntityChange = (newEntity) => {
    setEntity(newEntity);
    setAssignedFields([]);
    setLayoutConfig({ rows: [] });
    setSelectedField(null);
    loadAvailableFields(newEntity);
  };

  const handleAddField = (field) => {
    if (assignedFields.find(f => f.fieldId === field.id)) return;
    setAssignedFields([...assignedFields, {
      fieldId: field.id,
      label: field.label,
      key: field.key,
      type: field.type,
      orderIndex: assignedFields.length,
      visible: true,
      config: {}
    }]);
  };

  const handleRemoveField = (item) => {
    setAssignedFields(assignedFields.filter(f => f.fieldId !== item.fieldId));
    if (selectedField && selectedField.fieldId === item.fieldId) {
      setSelectedField(null);
    }
  };

  const handleFieldConfigChange = (fieldId, key, value) => {
    setAssignedFields(prev => prev.map(f =>
      f.fieldId === fieldId ? { ...f, config: { ...f.config, [key]: value } } : f
    ));
    if (selectedField && selectedField.fieldId === fieldId) {
      setSelectedField(prev => prev ? { ...prev, config: { ...prev.config, [key]: value } } : null);
    }
  };

  const addRow = () => {
    const newId = `r${Date.now()}`;
    setLayoutConfig(prev => ({
      ...prev,
      rows: [...prev.rows, { id: newId, columns: '1:2' }]
    }));
  };

  const removeRow = (rowId) => {
    setLayoutConfig(prev => ({
      ...prev,
      rows: prev.rows.filter(r => r.id !== rowId)
    }));
    setAssignedFields(prev => prev.map(f => {
      if (f.config?.rowId === rowId) {
        const { rowId: _, rowIndex: __, colIndex: ___, ...rest } = f.config;
        return { ...f, config: rest };
      }
      return f;
    }));
  };

  const updateRowColumns = (rowId, columns) => {
    setLayoutConfig(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.id === rowId ? { ...r, columns } : r)
    }));
  };

  const moveRow = (rowId, direction) => {
    setLayoutConfig(prev => {
      const rows = [...prev.rows];
      const idx = rows.findIndex(r => r.id === rowId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= rows.length) return prev;
      [rows[idx], rows[newIdx]] = [rows[newIdx], rows[idx]];
      return { ...prev, rows };
    });
  };

  const assignFieldToCell = (fieldId, rowId, colIndex) => {
    setAssignedFields(prev => prev.map(f =>
      f.fieldId === fieldId
        ? { ...f, config: { ...f.config, rowId, rowIndex: layoutConfig.rows.findIndex(r => r.id === rowId), colIndex } }
        : f
    ));
  };

  const removeFieldFromCell = (rowId, colIndex) => {
    setAssignedFields(prev => prev.map(f => {
      if (f.config?.rowId === rowId && f.config?.colIndex === colIndex) {
        const { rowId: _, rowIndex: __, colIndex: ___, ...rest } = f.config;
        return { ...f, config: rest };
      }
      return f;
    }));
    if (selectedField && selectedField.config?.rowId === rowId && selectedField.config?.colIndex === colIndex) {
      setSelectedField(null);
    }
  };

  const getCellField = (rowId, colIndex) => {
    return assignedFields.find(f => f.config?.rowId === rowId && f.config?.colIndex === colIndex);
  };

  const handleDrop = (e, rowId, colIndex) => {
    e.preventDefault();
    setDragOverCell(null);
    const fieldId = parseInt(e.dataTransfer.getData('fieldId'));
    if (!fieldId) return;
    const existing = getCellField(rowId, colIndex);
    if (existing) return;
    assignFieldToCell(fieldId, rowId, colIndex);
  };

  const handleDragOver = (e, rowId, colIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell(`${rowId}-${colIndex}`);
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleConditionChange = (fieldId, condIdx, key, value) => {
    setAssignedFields(prev => prev.map(f => {
      if (f.fieldId !== fieldId) return f;
      const conditions = [...(f.config?.conditions || [])];
      conditions[condIdx] = { ...conditions[condIdx], [key]: value };
      return { ...f, config: { ...f.config, conditions } };
    }));
    if (selectedField && selectedField.fieldId === fieldId) {
      setSelectedField(prev => {
        if (!prev) return null;
        const conditions = [...(prev.config?.conditions || [])];
        conditions[condIdx] = { ...conditions[condIdx], [key]: value };
        return { ...prev, config: { ...prev.config, conditions } };
      });
    }
  };

  const addCondition = (fieldId) => {
    setAssignedFields(prev => prev.map(f => {
      if (f.fieldId !== fieldId) return f;
      const conditions = [...(f.config?.conditions || []), { field: '', operator: '=', value: '' }];
      return { ...f, config: { ...f.config, conditions } };
    }));
    if (selectedField && selectedField.fieldId === fieldId) {
      setSelectedField(prev => {
        if (!prev) return null;
        const conditions = [...(prev.config?.conditions || []), { field: '', operator: '=', value: '' }];
        return { ...prev, config: { ...prev.config, conditions } };
      });
    }
  };

  const removeCondition = (fieldId, condIdx) => {
    setAssignedFields(prev => prev.map(f => {
      if (f.fieldId !== fieldId) return f;
      const conditions = (f.config?.conditions || []).filter((_, i) => i !== condIdx);
      return { ...f, config: { ...f.config, conditions } };
    }));
    if (selectedField && selectedField.fieldId === fieldId) {
      setSelectedField(prev => {
        if (!prev) return null;
        const conditions = (prev.config?.conditions || []).filter((_, i) => i !== condIdx);
        return { ...prev, config: { ...prev.config, conditions } };
      });
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('Vui lòng nhập tên form');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let res;
      if (formId) {
        res = await formService.update(formId, { entity, name: formName, description: formDesc, layout_config: layoutConfig }, token);
      } else {
        res = await formService.create({ entity, name: formName, description: formDesc, layout_config: layoutConfig }, token);
      }
      if (!res.success) {
        setError(res.message || 'Lỗi lưu form');
        setSaving(false);
        return;
      }
      const savedFormId = formId || res.data.id;

      const existingFieldsRes = await formFieldService.getByForm(savedFormId);
      const existingIds = existingFieldsRes.success ? existingFieldsRes.data.map(f => f.id) : [];
      const keptIds = assignedFields.filter(f => f.id).map(f => f.id);
      for (const exId of existingIds) {
        if (!keptIds.includes(exId)) {
          await formFieldService.remove(savedFormId, exId, token);
        }
      }

      for (const field of assignedFields) {
        const config = { ...field.config };
        if (field.id) {
          await formFieldService.update(savedFormId, field.id, {
            order_index: field.orderIndex,
            visible: field.visible ? 1 : 0,
            config
          }, token);
        } else {
          await formFieldService.add(savedFormId, {
            field_id: field.fieldId,
            order_index: field.orderIndex,
            visible: field.visible ? 1 : 0,
            config
          }, token);
        }
      }
      setToast({ message: 'Lưu form thành công', type: 'success' });
      if (onSaved) onSaved();
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Đang tải cấu hình...</div>;

  const filteredAvailable = availableFields.filter(f => !assignedFields.find(a => a.fieldId === f.id));
  const unassignedFields = assignedFields.filter(f => !f.config?.rowId);

  return (
    <div className="form-builder">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      {error && <ErrorMessage message={error} />}

      <div style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Entity</label>
            <select value={entity} onChange={(e) => handleEntityChange(e.target.value)} disabled={!!formId}>
              {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Tên form *</label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="VD: Form tạo trạm" />
          </div>
        </div>
        <div className="form-group">
          <label>Mô tả</label>
          <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Mô tả ngắn" />
        </div>
      </div>

      <div className="layout-section">
        <div className="layout-section-header">
          <strong>Cấu hình Layout</strong>
        </div>
        <div className="layout-rows">
          {layoutConfig.rows.map((row, idx) => (
            <div key={row.id} className="layout-row-item">
              <span className="layout-row-label">Row {idx + 1}</span>
              <select value={row.columns} onChange={(e) => updateRowColumns(row.id, e.target.value)}>
                {COL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <button className="btn btn-sm" onClick={() => moveRow(row.id, 'up')} disabled={idx === 0}>↑</button>
              <button className="btn btn-sm" onClick={() => moveRow(row.id, 'down')} disabled={idx === layoutConfig.rows.length - 1}>↓</button>
              <button className="btn btn-sm btn-delete" onClick={() => removeRow(row.id)}>✕</button>
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={addRow}>+ Thêm hàng</button>
        </div>
      </div>

      <div className="preview-toggle">
        <button className={previewMode === 'desktop' ? 'active' : ''} onClick={() => setPreviewMode('desktop')}>💻 Desktop</button>
        <button className={previewMode === 'mobile' ? 'active' : ''} onClick={() => setPreviewMode('mobile')}>📱 Mobile</button>
      </div>

      <div className="builder-layout">
        <div className="builder-panel" style={{ flex: 2 }}>
          <div className="builder-panel-header">Form Preview</div>
          <div className="builder-panel-body">
            <div
              className={`preview-container ${previewMode === 'mobile' ? 'mobile-mode' : ''}`}
              style={{
                maxWidth: previewMode === 'mobile' ? '375px' : '100%',
                margin: previewMode === 'mobile' ? '0 auto' : '0',
                border: previewMode === 'mobile' ? '2px solid #e2e8f0' : 'none',
                borderRadius: previewMode === 'mobile' ? '20px' : '0',
                padding: previewMode === 'mobile' ? '16px' : '0'
              }}
            >
              {layoutConfig.rows.length === 0 ? (
                <div className="builder-empty">Chưa có hàng nào. Nhấn "+ Thêm hàng" để bắt đầu.</div>
              ) : layoutConfig.rows.map((row) => {
                const desktopCols = parseInt(row.columns.split(':')[1]);
                const isStacked = previewMode === 'mobile' && desktopCols > 1;
                return (
                  <div key={row.id} className={`form-row ${isStacked ? 'form-row-stacked' : ''}`} data-cols={row.columns}>
                    {Array.from({ length: desktopCols }).map((_, colIdx) => {
                      const cellField = getCellField(row.id, colIdx);
                      const cellKey = `${row.id}-${colIdx}`;
                      const isOver = dragOverCell === cellKey;
                      return (
                        <div
                          key={colIdx}
                          className={`form-cell ${cellField ? 'has-field' : 'drop-zone'} ${isOver ? 'drag-over' : ''}`}
                          onDragOver={(e) => handleDragOver(e, row.id, colIdx)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, row.id, colIdx)}
                        >
                          {cellField ? (
                            <div className="field-assigned" onClick={() => setSelectedField(cellField)}>
                              <span className="field-assigned-label">{cellField.label}</span>
                              <span className="field-assigned-type">{cellField.type}</span>
                              <button className="btn btn-sm btn-delete" onClick={(e) => { e.stopPropagation(); removeFieldFromCell(row.id, colIdx); }}>✕</button>
                            </div>
                          ) : (
                            <span className="drop-hint">Kéo field vào đây</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {unassignedFields.length > 0 && (
                <div className="unassigned-section">
                  <div className="unassigned-label">Fields chưa xếp vào layout:</div>
                  {unassignedFields.map(field => (
                    <div key={field.fieldId} className="field-chip" draggable
                      onDragStart={(e) => { e.dataTransfer.setData('fieldId', String(field.fieldId)); e.dataTransfer.effectAllowed = 'move'; }}>
                      {field.label}
                      <button className="btn btn-sm btn-delete" onClick={() => handleRemoveField(field)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="builder-panel" style={{ flex: 1 }}>
          <div className="builder-panel-header">Available Fields ({filteredAvailable.length})</div>
          <div className="builder-panel-body">
            {filteredAvailable.length === 0 ? (
              <div className="builder-empty">Không có field nào khả dụng</div>
            ) : filteredAvailable.map(field => (
              <div key={field.id} className="builder-available-item"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('fieldId', String(field.id)); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => handleAddField(field)}>
                <div>
                  <strong>{field.label}</strong>
                  <div style={{ fontSize: 12, color: '#888' }}>{field.key} · {field.type}</div>
                </div>
                <span style={{ color: '#4a6cf7', fontSize: 20 }}>+</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedField && (
        <div className="field-config-panel">
          <div className="field-config-header">
            <h3>Cấu hình: {selectedField.label} <code>{selectedField.key}</code></h3>
            <button className="btn btn-sm" onClick={() => setSelectedField(null)}>✕ Đóng</button>
          </div>
          <div className="field-config-body">
            <div className="form-row">
              <div className="form-group">
                <label>Label tùy chỉnh</label>
                <input value={selectedField.config?.labelOverride || ''} onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'labelOverride', e.target.value)} placeholder={selectedField.label} />
              </div>
              <div className="form-group">
                <label>Placeholder</label>
                <input value={selectedField.config?.placeholderOverride || ''} onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'placeholderOverride', e.target.value)} placeholder={availableFields.find(f => f.id === selectedField.fieldId)?.placeholder || ''} />
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input type="checkbox" checked={selectedField.config?.requiredOverride ?? availableFields.find(f => f.id === selectedField.fieldId)?.required ?? false}
                  onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'requiredOverride', e.target.checked)} />
                Bắt buộc
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={selectedField.config?.readonly || false}
                  onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'readonly', e.target.checked)} />
                Chỉ đọc
              </label>
            </div>
            <div className="form-group">
              <label>Chiều cao (RowSpan)</label>
              <select value={selectedField.config?.rowSpan || 1} onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'rowSpan', parseInt(e.target.value))}>
                <option value={1}>Bình thường</option>
                <option value={2}>Cao (textarea)</option>
              </select>
            </div>
            <div className="conditions-section">
              <label>Điều kiện hiển thị</label>
              {(selectedField.config?.conditions || []).map((cond, i) => (
                <div key={i} className="condition-row">
                  <select value={cond.field} onChange={(e) => handleConditionChange(selectedField.fieldId, i, 'field', e.target.value)}>
                    <option value="">-- Chọn field --</option>
                    {availableFields.filter(f => f.id !== selectedField.fieldId).map(f => (
                      <option key={f.id} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                  <select value={cond.operator} onChange={(e) => handleConditionChange(selectedField.fieldId, i, 'operator', e.target.value)}>
                    <option value="=">=</option>
                    <option value="!=">≠</option>
                    <option value="contains">chứa</option>
                    <option value=">">{">"}</option>
                    <option value="<">{"<"}</option>
                    <option value="empty">trống</option>
                    <option value="not_empty">không trống</option>
                  </select>
                  {!['empty', 'not_empty'].includes(cond.operator) && (
                    <input value={cond.value || ''} onChange={(e) => handleConditionChange(selectedField.fieldId, i, 'value', e.target.value)} placeholder="Giá trị" />
                  )}
                  <button className="btn btn-sm btn-delete" onClick={() => removeCondition(selectedField.fieldId, i)}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm btn-secondary" onClick={() => addCondition(selectedField.fieldId)}>+ Thêm điều kiện</button>
              {(selectedField.config?.conditions || []).length > 1 && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label>Logic</label>
                  <select value={selectedField.config?.conditionLogic || 'AND'} onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'conditionLogic', e.target.value)}>
                    <option value="AND">AND (tất cả)</option>
                    <option value="OR">OR (bất kỳ)</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="builder-actions">
        <button className="btn btn-secondary" onClick={onSaved}>Hủy</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu form'}
        </button>
      </div>
    </div>
  );
};

export default FormBuilder;
