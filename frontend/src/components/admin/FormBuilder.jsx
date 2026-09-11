import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldDefinitionService, formService, formFieldService } from '../../services/api';
import Toast from '../Toast';
import ErrorMessage from '../ErrorMessage';
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, ChevronDown as ChevronDownIcon, Layers, Pencil, Check, X, Zap } from 'lucide-react';

const ENTITIES = ['stations', 'station_proposals', 'users'];
const PURPOSE_OPTIONS = [
  { value: 'create', label: 'Form nhập liệu' },
  { value: 'view', label: 'Form xem / sửa' },
  { value: 'all', label: 'Cả hai (chung)' }
];
const COL_OPTIONS = [
  { value: '1:1', label: '1 cột' },
  { value: '1:2', label: '2 cột' }
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
  const [formPurpose, setFormPurpose] = useState('all');
  const [availableFields, setAvailableFields] = useState([]);
  const [assignedFields, setAssignedFields] = useState([]);
  const [layoutConfig, setLayoutConfig] = useState({ sections: [], rows: [] });
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [configSectionId, setConfigSectionId] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [dragOverCell, setDragOverCell] = useState(null);
  const [dragOverRow, setDragOverRow] = useState(null);
  const [draggedRowId, setDraggedRowId] = useState(null);

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
        setFormPurpose(formRes.data.purpose || 'all');
        if (formRes.data.layout_config) {
          const lc = typeof formRes.data.layout_config === 'string'
            ? JSON.parse(formRes.data.layout_config)
            : formRes.data.layout_config;
          if (!lc.sections) {
            lc.sections = lc.rows && lc.rows.length > 0
              ? [{ id: 's1', title: 'Thông tin chung', collapsible: false, rows: lc.rows }]
              : [];
            lc.rows = [];
          }
          setLayoutConfig(lc);
        }
        const availFields = await loadAvailableFields(formRes.data.entity);
        const fieldsRes = await formFieldService.getByForm(formId);
        if (fieldsRes.success) {
          setAssignedFields(fieldsRes.data.map(f => {
            const cfg = f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) : {};
            if (f.field_type === 'table' && !cfg.tableConfig) {
              const fieldDef = availFields.find(af => af.id === f.field_id);
              if (fieldDef && fieldDef.source_config) {
                const sc = typeof fieldDef.source_config === 'string'
                  ? (() => { try { return JSON.parse(fieldDef.source_config); } catch { return null; } })()
                  : fieldDef.source_config;
                if (sc) cfg.tableConfig = sc;
              }
            }
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
        const data = res.data || [];
        setAvailableFields(data);
        return data;
      }
      return [];
    } catch {
      setError('Lỗi tải field definitions');
      return [];
    }
  };

  const handleEntityChange = (newEntity) => {
    setEntity(newEntity);
    setAssignedFields([]);
    setLayoutConfig({ sections: [], rows: [] });
    setSelectedField(null);
    loadAvailableFields(newEntity);
  };

  const handleAddField = (field) => {
    if (assignedFields.find(f => f.fieldId === field.id)) return;
    setAssignedFields([...assignedFields, {
      fieldId: field.id, label: field.label, key: field.key, type: field.type,
      orderIndex: assignedFields.length, visible: true, config: {}
    }]);
  };

  const handleRemoveField = (item) => {
    setAssignedFields(assignedFields.filter(f => f.fieldId !== item.fieldId));
    if (selectedField?.fieldId === item.fieldId) setSelectedField(null);
  };

  const handleFieldConfigChange = (fieldId, key, value) => {
    setAssignedFields(prev => prev.map(f =>
      f.fieldId === fieldId ? { ...f, config: { ...f.config, [key]: value } } : f
    ));
    if (selectedField?.fieldId === fieldId) {
      setSelectedField(prev => prev ? { ...prev, config: { ...prev.config, [key]: value } } : null);
    }
  };

  // ===== Layout: Row management =====
  const addRow = (sectionId, insertIndex) => {
    const newId = `r${Date.now()}`;
    setLayoutConfig(prev => {
      const sections = [...(prev.sections || [])];
      const secIdx = sections.findIndex(s => s.id === sectionId);
      if (secIdx >= 0) {
        const rows = [...sections[secIdx].rows];
        const idx = insertIndex !== undefined ? insertIndex : rows.length;
        rows.splice(idx, 0, { id: newId, columns: '1:2' });
        sections[secIdx] = { ...sections[secIdx], rows };
      }
      return { ...prev, sections };
    });
  };

  const removeRow = (rowId) => {
    setLayoutConfig(prev => ({
      ...prev,
      sections: (prev.sections || []).map(s => ({
        ...s,
        rows: s.rows.filter(r => r.id !== rowId)
      }))
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
      sections: (prev.sections || []).map(s => ({
        ...s,
        rows: s.rows.map(r => r.id === rowId ? { ...r, columns } : r)
      }))
    }));
    if (columns === '1:1') {
      setAssignedFields(prev => prev.map(f => {
        if (f.config?.rowId === rowId && f.config?.colIndex === 1) {
          const { rowId: _, rowIndex: __, colIndex: ___, ...rest } = f.config;
          return { ...f, config: rest };
        }
        return f;
      }));
    }
  };

  const moveRow = (rowId, direction, sectionId) => {
    setLayoutConfig(prev => {
      const sections = [...(prev.sections || [])];
      const secIdx = sections.findIndex(s => s.id === sectionId);
      if (secIdx < 0) return prev;
      const rows = [...sections[secIdx].rows];
      const idx = rows.findIndex(r => r.id === rowId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= rows.length) return prev;
      [rows[idx], rows[newIdx]] = [rows[newIdx], rows[idx]];
      sections[secIdx] = { ...sections[secIdx], rows };
      return { ...prev, sections };
    });
  };

  // ===== Field <-> Cell assignment =====
  const assignFieldToCell = (fieldId, rowId, colIndex) => {
    const allRows = getAllRows();
    const rowIdx = allRows.findIndex(r => r.id === rowId);
    setAssignedFields(prev => prev.map(f => {
      if (f.fieldId === fieldId) {
        return { ...f, config: { ...f.config, rowId, rowIndex: rowIdx, colIndex } };
      }
      if (f.config?.rowId === rowId && f.config?.colIndex === colIndex && f.fieldId !== fieldId) {
        const { rowId: _a, rowIndex: _b, colIndex: _c, ...rest } = f.config;
        return { ...f, config: rest };
      }
      return f;
    }));
  };

  const removeFieldFromCell = (rowId, colIndex) => {
    setAssignedFields(prev => prev.map(f => {
      if (f.config?.rowId === rowId && f.config?.colIndex === colIndex) {
        const { rowId: _, rowIndex: __, colIndex: ___, ...rest } = f.config;
        return { ...f, config: rest };
      }
      return f;
    }));
    if (selectedField?.config?.rowId === rowId && selectedField?.config?.colIndex === colIndex) {
      setSelectedField(null);
    }
  };

  const getCellField = (rowId, colIndex) => {
    return assignedFields.find(f => f.config?.rowId === rowId && f.config?.colIndex === colIndex);
  };

  const getAllRows = () => {
    const allRows = [];
    (layoutConfig.sections || []).forEach(sec => {
      sec.rows.forEach(r => allRows.push({ ...r, sectionId: sec.id }));
    });
    return allRows;
  };

  // ===== Drag & Drop: Fields =====
  const handleFieldDragStart = (e, fieldId) => {
    e.dataTransfer.setData('fieldId', String(fieldId));
    e.dataTransfer.setData('sourceType', 'field');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleAvailableFieldDragStart = (e, field) => {
    e.dataTransfer.setData('fieldId', String(field.id));
    e.dataTransfer.setData('sourceType', 'available');
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDrop = (e, rowId, colIndex) => {
    e.preventDefault();
    setDragOverCell(null);
    const fieldId = parseInt(e.dataTransfer.getData('fieldId'));
    if (!fieldId) return;

    const isAlreadyAssigned = assignedFields.find(f => f.fieldId === fieldId);
    if (!isAlreadyAssigned) {
      const field = availableFields.find(f => f.id === fieldId);
      if (field) {
        const allRows = getAllRows();
        const rowIdx = allRows.findIndex(r => r.id === rowId);
        setAssignedFields(prev => [...prev, {
          fieldId: field.id, label: field.label, key: field.key, type: field.type,
          orderIndex: prev.length, visible: true, config: { rowId, rowIndex: rowIdx, colIndex }
        }]);
        return;
      }
    }

    assignFieldToCell(fieldId, rowId, colIndex);
  };

  const handleDragOver = (e, rowId, colIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell(`${rowId}-${colIndex}`);
    setDragOverRow(null);
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  // ===== Drag & Drop: Rows =====
  const handleRowDragStart = (e, rowId) => {
    e.dataTransfer.setData('rowId', rowId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedRowId(rowId);
  };

  const handleRowDragOver = (e, rowId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRow(rowId);
    setDragOverCell(null);
  };

  const handleRowDrop = (e, targetRowId, sectionId) => {
    e.preventDefault();
    setDragOverRow(null);
    setDraggedRowId(null);
    const sourceRowId = e.dataTransfer.getData('rowId');
    if (!sourceRowId || sourceRowId === targetRowId) return;
    setLayoutConfig(prev => {
      const sections = [...(prev.sections || [])];
      const secIdx = sections.findIndex(s => s.id === sectionId);
      if (secIdx < 0) return prev;
      const rows = [...sections[secIdx].rows];
      const srcIdx = rows.findIndex(r => r.id === sourceRowId);
      const tgtIdx = rows.findIndex(r => r.id === targetRowId);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      const [moved] = rows.splice(srcIdx, 1);
      rows.splice(tgtIdx, 0, moved);
      sections[secIdx] = { ...sections[secIdx], rows };
      return { ...prev, sections };
    });
  };

  const handleRowDragLeave = () => {
    setDragOverRow(null);
  };

  // ===== Section management =====
  const addSection = () => {
    const newId = `s${Date.now()}`;
    setLayoutConfig(prev => {
      const sections = [...(prev.sections || []), { id: newId, title: `Section ${prev.sections.length + 1}`, collapsible: false, rows: [] }];
      return { ...prev, sections };
    });
    setActiveSectionId(newId);
  };

  const removeSection = (sectionId) => {
    setLayoutConfig(prev => {
      const sections = (prev.sections || []).filter(s => s.id !== sectionId);
      return { ...prev, sections };
    });
    setAssignedFields(prev => prev.map(f => {
      const section = (layoutConfig.sections || []).find(s => s.id === sectionId);
      if (section && section.rows.some(r => r.id === f.config?.rowId)) {
        const { rowId: _, rowIndex: __, colIndex: ___, ...rest } = f.config;
        return { ...f, config: rest };
      }
      return f;
    }));
  };

  const updateSectionTitle = (sectionId, title) => {
    setLayoutConfig(prev => ({
      ...prev,
      sections: (prev.sections || []).map(s => s.id === sectionId ? { ...s, title } : s)
    }));
  };

  const toggleSectionCollapsible = (sectionId) => {
    setLayoutConfig(prev => ({
      ...prev,
      sections: (prev.sections || []).map(s => s.id === sectionId ? { ...s, collapsible: !s.collapsible } : s)
    }));
  };

  const moveSection = (sectionId, direction) => {
    setLayoutConfig(prev => {
      const sections = [...(prev.sections || [])];
      const idx = sections.findIndex(s => s.id === sectionId);
      const ni = idx + direction;
      if (idx < 0 || ni < 0 || ni >= sections.length) return prev;
      [sections[idx], sections[ni]] = [sections[ni], sections[idx]];
      return { ...prev, sections };
    });
  };

  const updateSection = (sectionId, updates) => {
    setLayoutConfig(prev => ({
      ...prev,
      sections: (prev.sections || []).map(s => s.id === sectionId ? { ...s, ...updates } : s)
    }));
  };

  const startEditSectionTitle = (section) => {
    setEditingSectionId(section.id);
    setEditingSectionTitle(section.title);
  };

  const saveEditSectionTitle = () => {
    if (editingSectionId && editingSectionTitle.trim()) {
      updateSectionTitle(editingSectionId, editingSectionTitle.trim());
    }
    setEditingSectionId(null);
    setEditingSectionTitle('');
  };

  // ===== Conditions =====
  const handleConditionChange = (fieldId, condIdx, key, value) => {
    setAssignedFields(prev => prev.map(f => {
      if (f.fieldId !== fieldId) return f;
      const conditions = [...(f.config?.conditions || [])];
      conditions[condIdx] = { ...conditions[condIdx], [key]: value };
      return { ...f, config: { ...f.config, conditions } };
    }));
    if (selectedField?.fieldId === fieldId) {
      setSelectedField(prev => {
        if (!prev) return null;
        const conditions = [...(prev.config?.conditions || [])];
        conditions[condIdx] = { ...conditions[condIdx], [key]: value };
        return { ...prev, config: { ...prev.config, conditions } };
      });
    }
  };

  const addCondition = (fieldId) => {
    const cond = { field: '', operator: '=', value: '' };
    setAssignedFields(prev => prev.map(f =>
      f.fieldId === fieldId ? { ...f, config: { ...f.config, conditions: [...(f.config?.conditions || []), cond] } } : f
    ));
    if (selectedField?.fieldId === fieldId) {
      setSelectedField(prev => prev ? { ...prev, config: { ...prev.config, conditions: [...(prev.config?.conditions || []), cond] } } : null);
    }
  };

  const removeCondition = (fieldId, condIdx) => {
    setAssignedFields(prev => prev.map(f => {
      if (f.fieldId !== fieldId) return f;
      return { ...f, config: { ...f.config, conditions: (f.config?.conditions || []).filter((_, i) => i !== condIdx) } };
    }));
    if (selectedField?.fieldId === fieldId) {
      setSelectedField(prev => prev ? { ...prev, config: { ...prev.config, conditions: (prev.config?.conditions || []).filter((_, i) => i !== condIdx) } } : null);
    }
  };

  // ===== Save =====
  const handleSave = async () => {
    if (!formName.trim()) { setError('Vui lòng nhập tên form'); return; }
    setSaving(true);
    setError('');
    try {
      let res;
      if (formId) {
        res = await formService.update(formId, { entity, name: formName, description: formDesc, purpose: formPurpose, layout_config: layoutConfig }, token);
      } else {
        res = await formService.create({ entity, name: formName, description: formDesc, purpose: formPurpose, layout_config: layoutConfig }, token);
      }
      if (!res.success) { setError(res.message || 'Lỗi lưu form'); setSaving(false); return; }
      const savedFormId = formId || res.data.id;
      const existingFieldsRes = await formFieldService.getByForm(savedFormId);
      const existingIds = existingFieldsRes.success ? existingFieldsRes.data.map(f => f.id) : [];
      const keptIds = assignedFields.filter(f => f.id).map(f => f.id);
      for (const exId of existingIds) {
        if (!keptIds.includes(exId)) await formFieldService.remove(savedFormId, exId, token);
      }
      for (const field of assignedFields) {
        const config = { ...field.config };
        if (field.type === 'table' && config.tableConfig) {
          try {
            await fieldDefinitionService.update(field.fieldId, { table_config: config.tableConfig }, token);
          } catch (e) { console.error('[FormBuilder] Error saving table config', e); }
        }
        if (field.id) {
          await formFieldService.update(savedFormId, field.id, { order_index: field.orderIndex, visible: field.visible ? 1 : 0, config }, token);
        } else {
          await formFieldService.add(savedFormId, { field_id: field.fieldId, order_index: field.orderIndex, visible: field.visible ? 1 : 0, config }, token);
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
  const conditionFields = assignedFields.filter(f => ['select', 'text', 'boolean'].includes(f.type));

  return (
    <div className="form-builder">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      {error && <ErrorMessage message={error} />}

      {/* Basic Info */}
      <div className="mb-4">
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
          <div className="form-group">
            <label>Mục đích</label>
            <select value={formPurpose} onChange={(e) => setFormPurpose(e.target.value)}>
              {PURPOSE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Mô tả</label>
          <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Mô tả ngắn" />
        </div>
      </div>

      {/* Preview Toggle */}
      <div className="preview-toggle mb-3">
        <button className={`btn btn-xs ${previewMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPreviewMode('desktop')}>Desktop</button>
        <button className={`btn btn-xs ${previewMode === 'mobile' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPreviewMode('mobile')}>Mobile</button>
      </div>

      <div className="builder-layout">
        {/* Left: Preview with inline layout controls */}
        <div className="builder-panel flex-[2]">
          <div className="builder-panel-header">
            <span>Form Preview</span>
          </div>
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
              {/* Empty state */}
              {(layoutConfig.sections || []).length === 0 && (
                <div className="builder-empty mb-3">
                  <p className="text-sm text-gray-500 mb-2">Chưa có section nào. Bấm nút bên dưới để thêm section đầu tiên.</p>
                  <button className="btn btn-primary btn-sm gap-1" onClick={addSection}>
                    <Plus size={14} /> Thêm section
                  </button>
                </div>
              )}

              {/* Render each section as a block */}
              {(layoutConfig.sections || []).map((section, secIdx) => (
                <div key={section.id} className="section-block" style={{
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  marginBottom: 12,
                  background: '#fafbfc'
                }}>
                  {/* Section header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px',
                    borderBottom: section.rows.length > 0 ? '1px solid #e5e7eb' : 'none',
                    background: '#f3f4f6',
                    borderRadius: section.rows.length > 0 ? '8px 8px 0 0' : 8,
                    cursor: 'grab'
                  }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('sectionId', section.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <GripVertical size={14} className="text-gray-400" />
                    {editingSectionId === section.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                        <input
                          value={editingSectionTitle}
                          onChange={(e) => setEditingSectionTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditSectionTitle(); if (e.key === 'Escape') setEditingSectionId(null); }}
                          autoFocus
                          style={{ fontSize: 13, padding: '2px 6px', flex: 1, border: '1px solid #6366f1', borderRadius: 4 }}
                        />
                        <button className="btn btn-xs btn-ghost" onClick={saveEditSectionTitle}><Check size={12} /></button>
                        <button className="btn btn-xs btn-ghost" onClick={() => setEditingSectionId(null)}><X size={12} /></button>
                      </div>
                    ) : (
                      <span
                        style={{ fontWeight: 600, fontSize: 13, flex: 1, cursor: 'text' }}
                        onDoubleClick={() => startEditSectionTitle(section)}
                        title="Double-click để sửa tên"
                      >
                        {section.title}
                      </span>
                    )}
                    {section.visibleWhen && section.visibleWhen.field && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: '#fff3cd', color: '#856404', border: '1px solid #ffc107'
                      }}>
                        {section.visibleWhen.field} = {section.visibleWhen.value || '...'}
                      </span>
                    )}
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => toggleSectionCollapsible(section.id)}
                      title={section.collapsible ? 'Thu gọn được' : 'Cố định'}
                      style={{ padding: '0 4px' }}
                    >
                      {section.collapsible ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <button className="btn btn-xs btn-ghost" onClick={() => moveSection(section.id, -1)} disabled={secIdx === 0} title="Di chuyển lên">
                      <ChevronUp size={12} />
                    </button>
                    <button className="btn btn-xs btn-ghost" onClick={() => moveSection(section.id, 1)} disabled={secIdx === (layoutConfig.sections || []).length - 1} title="Di chuyển xuống">
                      <ChevronDown size={12} />
                    </button>
                    <button className="btn btn-xs btn-ghost" onClick={() => setConfigSectionId(configSectionId === section.id ? null : section.id)} title="Điều kiện hiển thị">
                      <Pencil size={12} />
                    </button>
                    <button className="btn btn-xs btn-ghost text-error" onClick={() => removeSection(section.id)} title="Xóa section">
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Section condition config */}
                  {configSectionId === section.id && (
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', background: '#f8f9ff', fontSize: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={!section.visibleWhen}
                          onChange={(e) => updateSection(section.id, {
                            visibleWhen: e.target.checked ? null : { field: section.visibleWhen?.field || '', value: section.visibleWhen?.value || '' }
                          })}
                        />
                        <span>Luôn hiển thị</span>
                      </label>
                      {section.visibleWhen && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <span className="text-gray-500">Hiện khi</span>
                          <select
                            className="select select-bordered select-xs"
                            value={section.visibleWhen.field || ''}
                            onChange={(e) => updateSection(section.id, { visibleWhen: { ...section.visibleWhen, field: e.target.value } })}
                          >
                            <option value="">-- Chọn field --</option>
                            {conditionFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          <span>=</span>
                          {(() => {
                            const def = availableFields.find(af => af.key === section.visibleWhen.field);
                            const opts = def && Array.isArray(def.options) ? def.options : [];
                            if (opts.length > 0) {
                              return (
                                <select
                                  className="select select-bordered select-xs"
                                  value={section.visibleWhen.value || ''}
                                  onChange={(e) => updateSection(section.id, { visibleWhen: { ...section.visibleWhen, value: e.target.value } })}
                                >
                                  <option value="">-- Chọn giá trị --</option>
                                  {opts.map((o, i) => {
                                    const val = (o && typeof o === 'object') ? (o.value ?? o.label) : o;
                                    const lbl = (o && typeof o === 'object') ? (o.label ?? o.value) : o;
                                    return <option key={i} value={val}>{lbl}</option>;
                                  })}
                                </select>
                              );
                            }
                            return (
                              <input
                                type="text"
                                className="input input-bordered input-xs"
                                placeholder="Giá trị"
                                value={section.visibleWhen.value || ''}
                                onChange={(e) => updateSection(section.id, { visibleWhen: { ...section.visibleWhen, value: e.target.value } })}
                              />
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section body: rows */}
                  <div style={{ padding: section.rows.length > 0 ? '8px' : '0', minHeight: section.rows.length === 0 ? 40 : 'auto' }}>
                    {section.rows.length === 0 && (
                      <div
                        style={{ border: '1px dashed #d1d5db', borderRadius: 6, padding: '12px 8px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fieldId = parseInt(e.dataTransfer.getData('fieldId'));
                          if (!fieldId) return;
                          const field = availableFields.find(f => f.id === fieldId);
                          if (!field) return;
                          const newRowId = `r${Date.now()}`;
                          setLayoutConfig(prev => {
                            const sections = [...(prev.sections || [])];
                            const si = sections.findIndex(s => s.id === section.id);
                            if (si >= 0) {
                              sections[si] = { ...sections[si], rows: [{ id: newRowId, columns: '1:1' }] };
                            }
                            return { ...prev, sections };
                          });
                          setTimeout(() => {
                            setAssignedFields(prev => [...prev, {
                              fieldId: field.id, label: field.label, key: field.key, type: field.type,
                              orderIndex: 0, visible: true, config: { rowId: newRowId, rowIndex: 0, colIndex: 0 }
                            }]);
                          }, 0);
                        }}
                      >
                        Kéo field vào đây
                      </div>
                    )}

                    {section.rows.map((row, rowIdx) => {
                      const desktopCols = parseInt(row.columns.split(':')[1]);
                      const isStacked = previewMode === 'mobile' && desktopCols > 1;
                      return (
                        <div key={row.id}>
                          {/* Insert row zone */}
                          <div
                            className={`insert-row-zone ${dragOverRow === `before-${row.id}` ? 'drag-over' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverRow(`before-${row.id}`); }}
                            onDragLeave={handleRowDragLeave}
                            onDrop={(e) => {
                              e.preventDefault(); setDragOverRow(null); setDraggedRowId(null);
                              const fieldId = parseInt(e.dataTransfer.getData('fieldId'));
                              if (fieldId && !assignedFields.find(f => f.fieldId === fieldId)) {
                                const field = availableFields.find(f => f.id === fieldId);
                                if (field) {
                                  const newId = `r${Date.now()}`;
                                  setLayoutConfig(prev => {
                                    const sections = [...(prev.sections || [])];
                                    const si = sections.findIndex(s => s.id === section.id);
                                    if (si >= 0) {
                                      const rows = [...sections[si].rows];
                                      rows.splice(rowIdx, 0, { id: newId, columns: '1:1' });
                                      sections[si] = { ...sections[si], rows };
                                    }
                                    return { ...prev, sections };
                                  });
                                  setTimeout(() => {
                                    setAssignedFields(prev => [...prev, {
                                      fieldId: field.id, label: field.label, key: field.key, type: field.type,
                                      orderIndex: prev.length, visible: true, config: { rowId: newId, rowIndex: rowIdx, colIndex: 0 }
                                    }]);
                                  }, 0);
                                  return;
                                }
                              }
                              const sec = (layoutConfig.sections || []).find(s => s.id === section.id);
                              if (sec) {
                                setLayoutConfig(prev => {
                                  const sections = [...(prev.sections || [])];
                                  const si = sections.findIndex(s => s.id === section.id);
                                  if (si >= 0) {
                                    const rows = [...sections[si].rows];
                                    rows.splice(rowIdx, 0, { id: newId || `r${Date.now()}`, columns: '1:2' });
                                    sections[si] = { ...sections[si], rows };
                                  }
                                  return { ...prev, sections };
                                });
                              }
                            }}
                          >
                            <button className="btn btn-xs btn-ghost opacity-0 hover:opacity-100 insert-row-btn" onClick={() => {
                              const newId = `r${Date.now()}`;
                              setLayoutConfig(prev => {
                                const sections = [...(prev.sections || [])];
                                const si = sections.findIndex(s => s.id === section.id);
                                if (si >= 0) {
                                  const rows = [...sections[si].rows];
                                  rows.splice(rowIdx, 0, { id: newId, columns: '1:2' });
                                  sections[si] = { ...sections[si], rows };
                                }
                                return { ...prev, sections };
                              });
                            }}>
                              <Plus size={12} /> Thêm hàng
                            </button>
                          </div>

                          {/* Row container */}
                          <div
                            className={`preview-row ${dragOverRow === row.id ? 'row-drag-over' : ''}`}
                            onDragOver={(e) => handleRowDragOver(e, row.id)}
                            onDragLeave={handleRowDragLeave}
                            onDrop={(e) => handleRowDrop(e, row.id, section.id)}
                          >
                            <div className="row-header">
                              <div
                                className="row-drag-handle"
                                draggable
                                onDragStart={(e) => handleRowDragStart(e, row.id)}
                                onDragEnd={() => setDraggedRowId(null)}
                              >
                                <GripVertical size={14} />
                              </div>
                              <span className="row-label text-xs text-gray-500">Hàng {rowIdx + 1}</span>
                              <select
                                className="select select-bordered select-xs w-auto ml-1"
                                value={row.columns}
                                onChange={(e) => updateRowColumns(row.id, e.target.value)}
                              >
                                {COL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                              <div className="row-actions ml-auto flex gap-0.5">
                                <button className="btn btn-xs btn-ghost" onClick={() => moveRow(row.id, 'up', section.id)} disabled={rowIdx === 0} title="Lên">
                                  <ChevronUp size={14} />
                                </button>
                                <button className="btn btn-xs btn-ghost" onClick={() => moveRow(row.id, 'down', section.id)} disabled={rowIdx === section.rows.length - 1} title="Xuống">
                                  <ChevronDown size={14} />
                                </button>
                                <button className="btn btn-xs btn-ghost text-error" onClick={() => removeRow(row.id)} title="Xóa hàng">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            {/* Row cells */}
                            <div className={`form-row ${isStacked ? 'form-row-stacked' : ''}`} data-cols={row.columns}>
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
                                      <div
                                        className="field-assigned"
                                        draggable
                                        onDragStart={(e) => handleFieldDragStart(e, cellField.fieldId)}
                                        onClick={() => setSelectedField(cellField)}
                                      >
                                        <GripVertical size={12} className="opacity-40 cursor-grab" />
                                        <div className="flex-1 min-w-0">
                                          <span className="field-assigned-label">{cellField.label}</span>
                                          <span className="field-assigned-type">{cellField.type}</span>
                                        </div>
                                        <button className="btn btn-xs btn-ghost text-error" onClick={(e) => { e.stopPropagation(); removeFieldFromCell(row.id, colIdx); }}>
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="drop-hint">Kéo field vào đây</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Insert row zone after last row in section */}
                    {section.rows.length > 0 && (
                      <div
                        className={`insert-row-zone ${dragOverRow === `after-last-${section.id}` ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverRow(`after-last-${section.id}`); }}
                        onDragLeave={handleRowDragLeave}
                        onDrop={(e) => {
                          e.preventDefault(); setDragOverRow(null); setDraggedRowId(null);
                          const fieldId = parseInt(e.dataTransfer.getData('fieldId'));
                          const newId = `r${Date.now()}`;
                          if (fieldId && !assignedFields.find(f => f.fieldId === fieldId)) {
                            const field = availableFields.find(f => f.id === fieldId);
                            if (field) {
                              setLayoutConfig(prev => {
                                const sections = [...(prev.sections || [])];
                                const si = sections.findIndex(s => s.id === section.id);
                                if (si >= 0) {
                                  sections[si] = { ...sections[si], rows: [...sections[si].rows, { id: newId, columns: '1:1' }] };
                                }
                                return { ...prev, sections };
                              });
                              setTimeout(() => {
                                setAssignedFields(prev => [...prev, {
                                  fieldId: field.id, label: field.label, key: field.key, type: field.type,
                                  orderIndex: prev.length, visible: true, config: { rowId: newId, rowIndex: section.rows.length, colIndex: 0 }
                                }]);
                              }, 0);
                              return;
                            }
                          }
                          setLayoutConfig(prev => {
                            const sections = [...(prev.sections || [])];
                            const si = sections.findIndex(s => s.id === section.id);
                            if (si >= 0) {
                              sections[si] = { ...sections[si], rows: [...sections[si].rows, { id: newId, columns: '1:2' }] };
                            }
                            return { ...prev, sections };
                          });
                        }}
                      >
                        <button className="btn btn-xs btn-ghost opacity-0 hover:opacity-100 insert-row-btn" onClick={() => {
                          const newId = `r${Date.now()}`;
                          setLayoutConfig(prev => {
                            const sections = [...(prev.sections || [])];
                            const si = sections.findIndex(s => s.id === section.id);
                            if (si >= 0) {
                              sections[si] = { ...sections[si], rows: [...sections[si].rows, { id: newId, columns: '1:2' }] };
                            }
                            return { ...prev, sections };
                          });
                        }}>
                          <Plus size={12} /> Thêm hàng
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Add section button at bottom */}
              {(layoutConfig.sections || []).length > 0 && (
                <div style={{ textAlign: 'center', margin: '8px 0' }}>
                  <button className="btn btn-outline btn-primary btn-sm gap-1" onClick={addSection}>
                    <Plus size={14} /> Thêm section
                  </button>
                </div>
              )}

              {/* Unassigned fields */}
              {unassignedFields.length > 0 && (
                <div className="unassigned-section mt-3">
                  <div className="unassigned-label text-xs text-gray-500 mb-1">Fields chưa xếp vào section:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {unassignedFields.map(field => (
                      <div key={field.fieldId} className="field-chip" draggable
                        onDragStart={(e) => handleFieldDragStart(e, field.fieldId)}>
                        {field.label}
                        <button className="btn btn-xs btn-ghost text-error" onClick={() => handleRemoveField(field)}>
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Available Fields */}
        <div className="builder-panel flex-1">
          <div className="builder-panel-header">Available Fields ({filteredAvailable.length})</div>
          <div className="builder-panel-body">
            {filteredAvailable.length === 0 ? (
              <div className="builder-empty">Không có field nào khả dụng</div>
            ) : filteredAvailable.map(field => (
              <div key={field.id} className="builder-available-item"
                draggable
                onDragStart={(e) => handleAvailableFieldDragStart(e, field)}
                onClick={() => handleAddField(field)}>
                <div>
                  <strong>{field.label}</strong>
                  <div className="text-xs text-gray-400">{field.key} · {field.type}</div>
                </div>
                <Plus size={16} className="text-indigo-500" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Field Config Panel */}
      {selectedField && (
        <div className="field-config-panel mt-3">
          <div className="field-config-header">
            <h3>Cấu hình: {selectedField.label} <code>{selectedField.key}</code></h3>
            <button className="btn btn-xs btn-ghost" onClick={() => setSelectedField(null)}>✕ Đóng</button>
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
                  <button className="btn btn-xs btn-ghost text-error" onClick={() => removeCondition(selectedField.fieldId, i)}>✕</button>
                </div>
              ))}
              <button className="btn btn-xs btn-secondary mt-1" onClick={() => addCondition(selectedField.fieldId)}>+ Thêm điều kiện</button>
              {(selectedField.config?.conditions || []).length > 1 && (
                <div className="form-group mt-2">
                  <label>Logic</label>
                  <select value={selectedField.config?.conditionLogic || 'AND'} onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'conditionLogic', e.target.value)}>
                    <option value="AND">AND (tất cả)</option>
                    <option value="OR">OR (bất kỳ)</option>
                  </select>
                </div>
              )}
            </div>

            {selectedField.type === 'table' && (
              <div className="table-config-section mt-3" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Cấu hình bảng</label>
                <div className="form-row mt-1">
                  <div className="form-group">
                    <label>Số dòng tối thiểu</label>
                    <input type="number" min="0" value={selectedField.config?.tableConfig?.min_rows ?? 0}
                      onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                        ...(selectedField.config?.tableConfig || {}),
                        min_rows: parseInt(e.target.value) || 0
                      })} />
                  </div>
                  <div className="form-group">
                    <label>Số dòng tối đa</label>
                    <input type="number" min="1" value={selectedField.config?.tableConfig?.max_rows ?? 10}
                      onChange={(e) => handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                        ...(selectedField.config?.tableConfig || {}),
                        max_rows: parseInt(e.target.value) || 10
                      })} />
                  </div>
                </div>
                <label style={{ fontSize: 13, marginTop: 8 }}>Cột bảng</label>
                {(selectedField.config?.tableConfig?.columns || []).map((col, idx) => {
                  const isNumber = (!col.field_id && col.column_type === 'number') || (col.field_id && availableFields.find(f => f.id === parseInt(col.field_id))?.type === 'number');
                  return (
                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, marginBottom: 8, background: '#fafbfc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 24 }}>#{idx + 1}</span>
                        <select value={col.field_id || ''} onChange={(e) => {
                          const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                          const refField = availableFields.find(f => f.id === parseInt(e.target.value));
                          newCols[idx] = {
                            ...newCols[idx],
                            field_id: parseInt(e.target.value) || null,
                            key: refField ? refField.key : newCols[idx].key,
                            label: refField ? refField.label : newCols[idx].label,
                            column_type: refField ? refField.type : (newCols[idx].column_type || 'text')
                          };
                          handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                            ...(selectedField.config?.tableConfig || {}),
                            columns: newCols
                          });
                        }} style={{ flex: 2, minWidth: 140, fontSize: 12 }}>
                          <option value="">-- Tạo thủ công --</option>
                          {availableFields.filter(f => f.type !== 'table' && f.type !== 'formula' && f.type !== 'password').map(f => (
                            <option key={f.id} value={f.id}>{f.label} ({f.key})</option>
                          ))}
                        </select>
                        {!col.field_id && (
                          <select value={col.column_type || 'text'} onChange={(e) => {
                            const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                            newCols[idx] = { ...newCols[idx], column_type: e.target.value };
                            handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                              ...(selectedField.config?.tableConfig || {}),
                              columns: newCols
                            });
                          }} style={{ width: 90, fontSize: 12 }}>
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="datetime">DateTime</option>
                            <option value="boolean">Boolean</option>
                            <option value="select">Select</option>
                          </select>
                        )}
                        <button className="btn btn-xs btn-ghost text-error" onClick={() => {
                          const newCols = (selectedField.config?.tableConfig?.columns || []).filter((_, i) => i !== idx);
                          handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                            ...(selectedField.config?.tableConfig || {}),
                            columns: newCols
                          });
                        }}>✕</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        <input value={col.key || ''} placeholder="Key" onChange={(e) => {
                          const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                          newCols[idx] = { ...newCols[idx], key: e.target.value };
                          handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                            ...(selectedField.config?.tableConfig || {}),
                            columns: newCols
                          });
                        }} style={{ flex: 1, minWidth: 100, fontSize: 12 }} disabled={!!col.field_id} />
                        <input value={col.label || ''} placeholder="Label" onChange={(e) => {
                          const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                          newCols[idx] = { ...newCols[idx], label: e.target.value };
                          handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                            ...(selectedField.config?.tableConfig || {}),
                            columns: newCols
                          });
                        }} style={{ flex: 1, minWidth: 100, fontSize: 12 }} />
                        <input type="number" min="60" value={col.width || 120} placeholder="W" onChange={(e) => {
                          const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                          newCols[idx] = { ...newCols[idx], width: parseInt(e.target.value) || 120 };
                          handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                            ...(selectedField.config?.tableConfig || {}),
                            columns: newCols
                          });
                        }} style={{ width: 55, fontSize: 12 }} />
                        <label style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={!!col.required} onChange={(e) => {
                            const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                            newCols[idx] = { ...newCols[idx], required: e.target.checked };
                            handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                              ...(selectedField.config?.tableConfig || {}),
                              columns: newCols
                            });
                          }} /> Bắt buộc
                        </label>
                      </div>
                      {!col.field_id && col.column_type === 'select' && (
                        <div style={{ marginTop: 4, fontSize: 12 }}>
                          <input type="text" placeholder="Options (cách nhau bởi dấu phẩy)" value={(col.options || []).join(', ')}
                            onChange={(e) => {
                              const opts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                              newCols[idx] = { ...newCols[idx], options: opts };
                              handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                                ...(selectedField.config?.tableConfig || {}),
                                columns: newCols
                              });
                            }} style={{ width: '100%', fontSize: 12 }} />
                        </div>
                      )}
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        <input type="text" placeholder={`Formula (VD: so_luong * don_gia)`}
                          value={col.formula || ''}
                          onChange={(e) => {
                            const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                            newCols[idx] = { ...newCols[idx], formula: e.target.value };
                            handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                              ...(selectedField.config?.tableConfig || {}),
                              columns: newCols
                            });
                          }}
                          style={{ width: '100%', fontSize: 12, fontFamily: 'monospace', background: col.formula ? '#fffbeb' : undefined }}
                          disabled={!!col.field_id} />
                        {col.formula && <span style={{ color: '#d97706', fontSize: 11 }}><Zap size={11} style={{ verticalAlign: 'middle' }} /> Tự tính</span>}
                        {!col.formula && <span style={{ color: '#888', fontSize: 11 }}>Dùng tên cột khác trong dòng</span>}
                      </div>
                      {isNumber && (
                        <div style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontWeight: 500 }}>Footer:</label>
                          <select value={col.footer_formula || ''} onChange={(e) => {
                            const newCols = [...(selectedField.config?.tableConfig?.columns || [])];
                            newCols[idx] = { ...newCols[idx], footer_formula: e.target.value || null };
                            handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                              ...(selectedField.config?.tableConfig || {}),
                              columns: newCols
                            });
                          }} style={{ fontSize: 11, padding: '2px 4px' }}>
                            <option value="">Không</option>
                            <option value="SUM">SUM — Tổng</option>
                            <option value="AVG">AVG — Trung bình</option>
                            <option value="MIN">MIN — Nhỏ nhất</option>
                            <option value="MAX">MAX — Lớn nhất</option>
                            <option value="COUNT">COUNT — Đếm dòng</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button className="btn btn-xs btn-secondary mt-1" onClick={() => {
                  const newCols = [...(selectedField.config?.tableConfig?.columns || []), { field_id: null, key: '', label: '', column_type: 'text', width: 120, required: false, options: [] }];
                  handleFieldConfigChange(selectedField.fieldId, 'tableConfig', {
                    ...(selectedField.config?.tableConfig || {}),
                    columns: newCols
                  });
                }}>+ Thêm cột</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="builder-actions mt-3">
        <button className="btn btn-ghost" onClick={onSaved}>Hủy</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu form'}
        </button>
      </div>
    </div>
  );
};

export default FormBuilder;
