import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { oneOfficeSyncService } from '../../services/api';
import Toast from '../Toast';
import { Save, X, Plus, Trash2, GripVertical, Eye, ChevronUp, ChevronDown, Code, Pencil, Check } from 'lucide-react';

const OPERATORS = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: 'contains', label: 'chứa' },
  { value: 'empty', label: 'trống' },
  { value: 'not_empty', label: 'không trống' }
];

const COLORS = [
  { value: '#e74c3c', label: 'Đỏ' },
  { value: '#3498db', label: 'Xanh dương' },
  { value: '#27ae60', label: 'Xanh lá' },
  { value: '#f39c12', label: 'Cam' },
  { value: '#9b59b6', label: 'Tím' },
  { value: '#1abc9c', label: 'Ngọc' },
  { value: '#34495e', label: 'Xám' }
];

const LAYOUTS = [
  { value: '2col', label: '2 cột' },
  { value: '1col', label: '1 cột' },
  { value: 'table', label: 'Bảng' }
];

const PROPOSALS_ENTITY = 'station_proposals';
const PROPOSALS_FORM_ID = 13;
const NON_RENDERABLE_TYPES = ['file', 'password'];

const TemplateEditor = ({ configId, onClose }) => {
  const { token } = useAuth();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [proposalId, setProposalId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [formFields, setFormFields] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [formSections, setFormSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [dragState, setDragState] = useState(null);

  const loadForm = useCallback(async () => {
    const api = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    let resolvedId = PROPOSALS_FORM_ID;
    try {
      const res = await fetch(`${api}/forms/by-entity-purpose?entity=${PROPOSALS_ENTITY}&purpose=view`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        resolvedId = data.data.id;
        let layoutConfig = data.data.layout_config;
        if (typeof layoutConfig === 'string') {
          try { layoutConfig = JSON.parse(layoutConfig); } catch { layoutConfig = { sections: [] }; }
        }
        setFormSections(layoutConfig.sections || []);
      }
    } catch {}
    try {
      const res = await fetch(`${api}/forms/${resolvedId}/fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        const skip = new Set(NON_RENDERABLE_TYPES);
        setFormFields(data.data
          .filter(f => !skip.has(f.type))
          .map(f => {
            const cfg = f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) : {};
            return {
              fieldId: f.field_id,
              key: f.field_key || f.key,
              label: f.field_label || f.label,
              type: f.field_type || f.type,
              rowId: cfg.rowId,
              colIndex: cfg.colIndex,
              rowIndex: cfg.rowIndex,
              colSpan: cfg.colSpan
            };
          }));
      }
    } catch {}
    try {
      const res = await fetch(`${api}/field-definitions?entity=${PROPOSALS_ENTITY}&status=active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        const skip = new Set(NON_RENDERABLE_TYPES);
        setAllFields(data.data
          .filter(f => !skip.has(f.type))
          .map(f => ({ fieldId: f.id, key: f.key, label: f.label, type: f.type })));
      }
    } catch {}
  }, [token]);

  const loadTemplate = useCallback(async () => {
    try {
      const res = await oneOfficeSyncService.getTemplate(configId, token);
      if (res.success && res.data?.sections?.length > 0) {
        setTemplate(res.data);
      } else {
        setTemplate({ sections: [] });
      }
    } catch {
      setTemplate({ sections: [] });
    } finally {
      setLoading(false);
    }
  }, [configId, token]);

  useEffect(() => {
    loadForm();
    loadTemplate();
  }, [loadForm, loadTemplate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await oneOfficeSyncService.updateTemplate(configId, template, token);
      if (res.success) {
        setToast({ message: 'Lưu template thành công', type: 'success' });
      } else {
        setToast({ message: res.message || 'Lỗi lưu', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!proposalId) { setToast({ message: 'Nhập Proposal ID', type: 'error' }); return; }
    setPreviewLoading(true);
    try {
      const res = await oneOfficeSyncService.previewDesc(configId, parseInt(proposalId), token);
      if (res.success) {
        setPreviewHtml(res.data.html);
        setShowPreview(true);
      } else {
        setToast({ message: res.message || 'Lỗi preview', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối', type: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const addSection = () => {
    const newSection = {
      id: `section_${Date.now()}`, title: 'Section mới', emoji: '📋', color: '#3498db',
      layout: '2col', always_show: true, collapsible: false, fields: []
    };
    setTemplate(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
  };

  const removeSection = (sectionId) => {
    const remove = (secs) => secs.filter(s => s.id !== sectionId).map(s => s.sections ? { ...s, sections: remove(s.sections) } : s);
    setTemplate(prev => ({ ...prev, sections: remove(prev.sections) }));
    if (selectedSection === sectionId) setSelectedSection(null);
  };

  const updateSection = (sectionId, updates) => {
    const patch = (secs) => secs.map(s => {
      if (s.id === sectionId) return { ...s, ...updates };
      if (s.sections) return { ...s, sections: patch(s.sections) };
      return s;
    });
    setTemplate(prev => ({ ...prev, sections: patch(prev.sections) }));
  };

  const addFieldToSection = (sectionId, fieldKey) => {
    if (!fieldKey) return;
    const add = (secs) => secs.map(s => {
      if (s.id === sectionId && !(s.fields || []).includes(fieldKey)) return { ...s, fields: [...(s.fields || []), fieldKey] };
      if (s.sections) return { ...s, sections: add(s.sections) };
      return s;
    });
    setTemplate(prev => ({ ...prev, sections: add(prev.sections) }));
  };

  const removeFieldFromSection = (sectionId, fieldKey) => {
    const rm = (secs) => secs.map(s => {
      if (s.id === sectionId) return { ...s, fields: (s.fields || []).filter(f => f !== fieldKey) };
      if (s.sections) return { ...s, sections: rm(s.sections) };
      return s;
    });
    setTemplate(prev => ({ ...prev, sections: rm(prev.sections) }));
  };

  const moveFieldInSection = (sectionId, fromIdx, toIdx) => {
    const mv = (secs) => secs.map(s => {
      if (s.id === sectionId) {
        const fields = s.fields || [];
        if (toIdx < 0 || toIdx >= fields.length) return s;
        const newFields = [...fields];
        const [moved] = newFields.splice(fromIdx, 1);
        newFields.splice(toIdx, 0, moved);
        return { ...s, fields: newFields };
      }
      if (s.sections) return { ...s, sections: mv(s.sections) };
      return s;
    });
    setTemplate(prev => ({ ...prev, sections: mv(prev.sections) }));
  };

  const moveSection = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= template.sections.length) return;
    const newSections = [...template.sections];
    const [moved] = newSections.splice(fromIndex, 1);
    newSections.splice(toIndex, 0, moved);
    setTemplate(prev => ({ ...prev, sections: newSections }));
  };

  const startEditSectionTitle = (section) => {
    setEditingSectionId(section.id);
    setEditingSectionTitle(section.title);
  };

  const saveEditSectionTitle = () => {
    if (editingSectionId && editingSectionTitle.trim()) {
      updateSection(editingSectionId, { title: editingSectionTitle.trim() });
    }
    setEditingSectionId(null);
  };

  const moveFieldToSection = (fieldKey, targetSectionId, targetIdx) => {
    if (!fieldKey) return;
    const result = { moved: null };
    const remove = (secs) => secs.map(s => {
      if (s.fields && s.fields.includes(fieldKey)) {
        result.moved = fieldKey;
        return { ...s, fields: s.fields.filter(f => f !== fieldKey) };
      }
      if (s.sections) return { ...s, sections: remove(s.sections) };
      return s;
    });
    let updated = remove(template.sections);
    const insert = (secs) => secs.map(s => {
      if (s.id === targetSectionId) {
        const fields = [...(s.fields || [])];
        const idx = Math.min(targetIdx, fields.length);
        fields.splice(idx, 0, fieldKey);
        return { ...s, fields };
      }
      if (s.sections) return { ...s, sections: insert(s.sections) };
      return s;
    });
    updated = insert(updated);
    setTemplate(prev => ({ ...prev, sections: updated }));
  };

  const moveSectionToPosition = (sectionId, targetIdx) => {
    const moveDeep = (secs) => {
      const idx = secs.findIndex(s => s.id === sectionId);
      if (idx !== -1) {
        const newSecs = [...secs];
        const [moved] = newSecs.splice(idx, 1);
        const insIdx = Math.min(targetIdx, newSecs.length);
        newSecs.splice(insIdx, 0, moved);
        return newSecs;
      }
      return secs.map(s => s.sections ? { ...s, sections: moveDeep(s.sections) } : s);
    };
    setTemplate(prev => ({ ...prev, sections: moveDeep(prev.sections) }));
  };

  const startDragField = (e, fieldKey, sourceSectionId, fieldIdx) => {
    e.dataTransfer.setData('text/plain', fieldKey);
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ type: 'field', fieldKey, sourceSectionId, fieldIdx });
  };

  const startDragSection = (e, sectionId) => {
    e.dataTransfer.setData('text/plain', sectionId);
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ type: 'section', sectionId });
  };

  const handleDragOverField = (e, targetSectionId, targetIdx) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget({ type: 'field', sectionId: targetSectionId, idx: targetIdx });
  };

  const handleDragOverSectionBody = (e, sectionId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget({ type: 'section-body', sectionId });
  };

  const handleDragOverSectionHeader = (e, sectionId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget({ type: 'section-header', sectionId });
  };

  const handleDragLeave = () => setDragOverTarget(null);

  const handleDropOnField = (e, targetSectionId, targetIdx) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    if (!dragState) return;
    if (dragState.type === 'field') {
      if (dragState.sourceSectionId === targetSectionId && dragState.fieldIdx === targetIdx) return;
      moveFieldToSection(dragState.fieldKey, targetSectionId, targetIdx);
    }
    setDragState(null);
  };

  const handleDropOnSectionBody = (e, sectionId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    if (!dragState) return;
    if (dragState.type === 'field') {
      if (dragState.sourceSectionId === sectionId) return;
      const sec = findSectionById(template.sections, sectionId);
      const targetIdx = sec ? (sec.fields || []).length : 0;
      moveFieldToSection(dragState.fieldKey, sectionId, targetIdx);
    }
    setDragState(null);
  };

  const handleDropOnSectionHeader = (e, sectionId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    if (!dragState) return;
    if (dragState.type === 'section') {
      if (dragState.sectionId === sectionId) return;
      const targetIdx = findSectionIndex(template.sections, sectionId);
      if (targetIdx !== -1) moveSectionToPosition(dragState.sectionId, targetIdx);
    } else if (dragState.type === 'field') {
      const sec = findSectionById(template.sections, sectionId);
      if (sec && sec.fields && !sec.fields.includes(dragState.fieldKey)) {
        moveFieldToSection(dragState.fieldKey, sectionId, sec.fields.length);
      }
    }
    setDragState(null);
  };

  const handleDropFromPanel = (e, sectionId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const fieldKey = e.dataTransfer.getData('text/plain');
    if (fieldKey) addFieldToSection(sectionId, fieldKey);
  };

  const findSectionById = (secs, id) => {
    for (const s of secs) {
      if (s.id === id) return s;
      if (s.sections) {
        const found = findSectionById(s.sections, id);
        if (found) return found;
      }
    }
    return null;
  };

  const findSectionIndex = (secs, id) => {
    const idx = secs.findIndex(s => s.id === id);
    if (idx !== -1) return idx;
    for (let i = 0; i < secs.length; i++) {
      if (secs[i].sections) {
        const childIdx = secs[i].sections.findIndex(s => s.id === id);
        if (childIdx !== -1) return childIdx;
      }
    }
    return -1;
  };

  const getUsedFieldKeys = () => {
    const used = new Set();
    const walk = (secs) => {
      (secs || []).forEach(s => {
        (s.fields || []).forEach(f => used.add(f));
        if (s.sections) walk(s.sections);
      });
    };
    walk(template?.sections);
    return used;
  };

  const loadFromForm = () => {
    if (template.sections.length > 0 && !window.confirm('Tải lại sẽ thay thế toàn bộ template hiện tại. Tiếp tục?')) return;
    const sectionMap = {};
    formSections.forEach(fs => { sectionMap[fs.id] = fs; });

    const buildSection = (fs, inheritedCondition) => {
      const visibleWhen = fs.visibleWhen || inheritedCondition;
      const isTabGroup = fs.type === 'tabs' || (Array.isArray(fs.tabs) && fs.tabs.length > 0);
      if (isTabGroup) {
        const childSections = [];
        (fs.tabs || []).forEach(tab => {
          (tab.sectionRefs || []).forEach(refId => {
            const ref = sectionMap[refId];
            if (ref) childSections.push(buildSection(ref, visibleWhen));
          });
        });
        return {
          id: fs.id,
          title: fs.title,
          emoji: '📋',
          color: '#27ae60',
          layout: '1col',
          always_show: !visibleWhen,
          collapsible: false,
          condition: visibleWhen ? { field: visibleWhen.field, operator: '=', value: visibleWhen.value } : null,
          sections: childSections
        };
      }
      const sectionFields = formFields
        .filter(f => fs.rows?.some(r => r.id === f.rowId))
        .sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0) || (a.colIndex || 0) - (b.colIndex || 0))
        .map(f => f.key);
      return {
        id: fs.id,
        title: fs.title,
        emoji: fs.id.includes('tdt') ? '💰' : fs.id.includes('lk') ? '🤝' : fs.id.includes('nq') ? '🏪' : '📋',
        color: visibleWhen?.value === 'TDT' ? '#f39c12' : visibleWhen?.value === 'LK' ? '#9b59b6' : visibleWhen?.value === 'NQ' ? '#3498db' : '#27ae60',
        layout: sectionFields.length > 4 ? '2col' : '1col',
        always_show: !visibleWhen,
        collapsible: false,
        condition: visibleWhen ? { field: visibleWhen.field, operator: '=', value: visibleWhen.value } : null,
        fields: sectionFields
      };
    };

    const sections = formSections.map(fs => buildSection(fs, null));
    setTemplate({ sections });
    setToast({ message: `Đã tải ${sections.length} sections từ form proposals`, type: 'success' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!template) {
    return <div className="text-center py-12 text-base-content/50">Không thể tải template</div>;
  }

  const usedKeys = getUsedFieldKeys();
  const availableFields = allFields.filter(f => !usedKeys.has(f.key));

  const findField = (key) => allFields.find(f => f.key === key) || formFields.find(f => f.key === key);

  const getSectionFieldDetails = (sectionId) => {
    const find = (secs) => {
      for (const s of secs) {
        if (s.id === sectionId) return s;
        if (s.sections) {
          const found = find(s.sections);
          if (found) return found;
        }
      }
      return null;
    };
    const section = find(template.sections || []);
    if (!section) return [];
    return (section.fields || []).map(fk => {
      const ff = findField(fk);
      return ff || { key: fk, label: fk, type: 'text' };
    });
  };

  return (
    <div className="form-builder">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Code size={18} className="text-primary" />
          <h3 className="font-bold text-lg">Desc Template Editor</h3>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      <div className="builder-layout" style={{ display: 'flex', gap: 20, minHeight: 400 }}>
        {/* Left: Sections with fields */}
        <div className="builder-panel flex-[2]" style={{ flex: 2 }}>
          <div className="builder-panel-header">
            <span>Sections ({template.sections.length})</span>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="number"
                className="input input-bordered input-xs w-24"
                placeholder="Proposal ID"
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value)}
              />
              <button
                className="btn btn-xs btn-outline gap-1"
                onClick={handlePreview}
                disabled={previewLoading || !proposalId}
              >
                {previewLoading ? <span className="loading loading-spinner loading-xs"></span> : <Eye size={12} />}
                Xem HTML
              </button>
            </div>
          </div>
          <div className="builder-panel-body" style={{ maxHeight: '600px' }}>
            {template.sections.length === 0 && (
              <div className="builder-empty mb-3">
                <p className="text-sm text-gray-500 mb-2">Chưa có section nào.</p>
                <div className="flex gap-2 justify-center">
                  <button className="btn btn-primary btn-sm gap-1" onClick={loadFromForm}>
                    Tải từ Form Proposals
                  </button>
                  <button className="btn btn-outline btn-sm gap-1" onClick={addSection}>
                    <Plus size={14} /> Thêm Section
                  </button>
                </div>
              </div>
            )}

            {template.sections.map((section, secIdx) => {
              const isTabGroup = Array.isArray(section.sections) && section.sections.length > 0;
              const hasCondition = !section.always_show && section.condition;
              return (
                <div
                  key={section.id}
                  className={`section-block ${dragOverTarget?.sectionId === section.id ? 'drag-over' : ''}`}
                  style={{
                    border: selectedSection === section.id ? '2px solid #4a6cf7' : isTabGroup ? '2px dashed #9b59b6' : '1px solid #d1d5db',
                    borderRadius: 8, marginBottom: 12, background: isTabGroup ? '#f5f0ff' : '#fafbfc'
                  }}
                >
                  {/* Section header - draggable + drop target */}
                  <div
                    draggable
                    onDragStart={(e) => startDragSection(e, section.id)}
                    onDragOver={(e) => handleDragOverSectionHeader(e, section.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDropOnSectionHeader(e, section.id)}
                    style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px',
                    borderBottom: isTabGroup ? '1px dashed #c4b5fd' : '1px solid #e5e7eb',
                    background: section.color ? `${section.color}15` : '#f3f4f6',
                    borderRadius: '8px 8px 0 0',
                    borderLeft: `4px solid ${section.color || '#e74c3c'}`
                  }}>
                    <GripVertical size={14} className="text-gray-400 cursor-grab" />

                    {editingSectionId === section.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          value={editingSectionTitle}
                          onChange={(e) => setEditingSectionTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditSectionTitle(); if (e.key === 'Escape') setEditingSectionId(null); }}
                          autoFocus
                          className="input input-bordered input-xs flex-1"
                          style={{ fontSize: 13 }}
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
                        {section.emoji} {section.title}
                        {isTabGroup && <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 6 }}>({section.sections.length} section con)</span>}
                      </span>
                    )}

                    {hasCondition && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: '#fff3cd', color: '#856404', border: '1px solid #ffc107'
                      }}>
                        {section.condition.field} {section.condition.operator} {section.condition.value}
                      </span>
                    )}

                    <button className="btn btn-xs btn-ghost" onClick={() => moveSection(secIdx, secIdx - 1)} disabled={secIdx === 0} title="Lên">
                      <ChevronUp size={12} />
                    </button>
                    <button className="btn btn-xs btn-ghost" onClick={() => moveSection(secIdx, secIdx + 1)} disabled={secIdx === template.sections.length - 1} title="Xuống">
                      <ChevronDown size={12} />
                    </button>
                    <button className="btn btn-xs btn-ghost" onClick={() => setSelectedSection(selectedSection === section.id ? null : section.id)} title="Cấu hình">
                      <Pencil size={12} />
                    </button>
                    <button className="btn btn-xs btn-ghost text-error" onClick={() => removeSection(section.id)} title="Xóa">
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Section config */}
                  {selectedSection === section.id && (
                    <div className="p-2 border-b border-gray-200" style={{ background: '#f8f9ff' }}>
                      <div className="flex flex-wrap gap-2 items-center" style={{ fontSize: 12 }}>
                        <label className="flex items-center gap-1">
                          <span className="text-gray-500">Emoji:</span>
                          <input
                            type="text"
                            className="input input-bordered input-xs w-10 text-center"
                            value={section.emoji || '📋'}
                            onChange={(e) => updateSection(section.id, { emoji: e.target.value })}
                          />
                        </label>
                        <label className="flex items-center gap-1">
                          <span className="text-gray-500">Màu:</span>
                          <select
                            className="select select-bordered select-xs"
                            value={section.color || '#e74c3c'}
                            onChange={(e) => updateSection(section.id, { color: e.target.value })}
                          >
                            {COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </label>
                        {!isTabGroup && (
                          <>
                            <label className="flex items-center gap-1">
                              <span className="text-gray-500">Layout:</span>
                              <select
                                className="select select-bordered select-xs"
                                value={section.layout || '2col'}
                                onChange={(e) => updateSection(section.id, { layout: e.target.value })}
                              >
                                {LAYOUTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                              </select>
                            </label>
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-xs checkbox-primary"
                                checked={section.always_show}
                                onChange={(e) => updateSection(section.id, {
                                  always_show: e.target.checked,
                                  condition: e.target.checked ? null : section.condition
                                })}
                              />
                              <span>Luôn hiển thị</span>
                            </label>
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-xs"
                                checked={section.collapsible}
                                onChange={(e) => updateSection(section.id, { collapsible: e.target.checked })}
                              />
                              <span>Thu gọn</span>
                            </label>
                          </>
                        )}
                        {isTabGroup && (
                          <span style={{ fontSize: 11, color: '#7c3aed', padding: '2px 8px', background: '#ede9fe', borderRadius: 4 }}>
                            Tab group — section con quản lý field
                          </span>
                        )}
                      </div>

                      {!section.always_show && !isTabGroup && (
                        <div className="flex items-center gap-2 mt-2" style={{ fontSize: 12 }}>
                          <span className="text-gray-500">Hiện khi:</span>
                          <select
                            className="select select-bordered select-xs"
                            value={section.condition?.field || ''}
                            onChange={(e) => updateSection(section.id, {
                              condition: { ...section.condition, field: e.target.value }
                            })}
                          >
                            <option value="">Chọn field</option>
                            {allFields.filter(f => f.type === 'select' || f.type === 'text').map(f => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>
                          <select
                            className="select select-bordered select-xs"
                            value={section.condition?.operator || '='}
                            onChange={(e) => updateSection(section.id, {
                              condition: { ...section.condition, operator: e.target.value }
                            })}
                          >
                            {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                          </select>
                          {!['empty', 'not_empty'].includes(section.condition?.operator) && (
                            <input
                              type="text"
                              className="input input-bordered input-xs"
                              placeholder="Giá trị"
                              value={section.condition?.value || ''}
                              onChange={(e) => updateSection(section.id, {
                                condition: { ...section.condition, value: e.target.value }
                              })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {isTabGroup ? (
                    <div className="p-2">
                      {section.sections.map((child) => {
                        const childFieldDetails = getSectionFieldDetails(child.id);
                        const childHasCondition = !child.always_show && child.condition;
                        return (
                          <div
                            key={child.id}
                            className={`section-block mb-2 ${dragOverTarget?.sectionId === child.id ? 'drag-over' : ''}`}
                            style={{
                              border: selectedSection === child.id ? '2px solid #4a6cf7' : '1px solid #e2e8f0',
                              borderRadius: 6, background: '#fff'
                            }}
                          >
                            <div
                              draggable
                              onDragStart={(e) => startDragSection(e, child.id)}
                              onDragOver={(e) => handleDragOverSectionHeader(e, child.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDropOnSectionHeader(e, child.id)}
                              style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '4px 8px',
                              borderBottom: '1px solid #f1f5f9',
                              background: child.color ? `${child.color}10` : '#f8fafc',
                              borderRadius: '6px 6px 0 0',
                              borderLeft: `3px solid ${child.color || '#64748b'}`
                            }}>
                              <GripVertical size={12} className="text-gray-400 cursor-grab" />
                              {editingSectionId === child.id ? (
                                <div className="flex items-center gap-1 flex-1">
                                  <input
                                    value={editingSectionTitle}
                                    onChange={(e) => setEditingSectionTitle(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveEditSectionTitle(); if (e.key === 'Escape') setEditingSectionId(null); }}
                                    autoFocus
                                    className="input input-bordered input-xs flex-1"
                                    style={{ fontSize: 12 }}
                                  />
                                  <button className="btn btn-xs btn-ghost" onClick={saveEditSectionTitle}><Check size={11} /></button>
                                  <button className="btn btn-xs btn-ghost" onClick={() => setEditingSectionId(null)}><X size={11} /></button>
                                </div>
                              ) : (
                                <span
                                  style={{ fontWeight: 600, fontSize: 12, flex: 1, cursor: 'text' }}
                                  onDoubleClick={() => startEditSectionTitle(child)}
                                >
                                  {child.emoji} {child.title}
                                </span>
                              )}
                              {childHasCondition && (
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' }}>
                                  {child.condition.field} {child.condition.operator} {child.condition.value}
                                </span>
                              )}
                              <button className="btn btn-ghost btn-xs p-0" onClick={() => setSelectedSection(selectedSection === child.id ? null : child.id)} title="Cấu hình">
                                <Pencil size={11} />
                              </button>
                            </div>
                            <div className="p-2" style={{ minHeight: 32 }}
                              onDragOver={(e) => handleDragOverSectionBody(e, child.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDropOnSectionBody(e, child.id)}
                            >
                              {childFieldDetails.length === 0 ? (
                                <div style={{ border: dragOverTarget?.sectionId === child.id ? '2px dashed #4a6cf7' : '1px dashed #d1d5db', borderRadius: 4, padding: '8px 6px', textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
                                  Kéo field vào đây
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {childFieldDetails.map((ff, fi) => {
                                    const isDragOver = dragOverTarget?.type === 'field' && dragOverTarget?.sectionId === child.id && dragOverTarget?.idx === fi;
                                    return (
                                      <div key={ff.key}
                                        draggable
                                        onDragStart={(e) => startDragField(e, ff.key, child.id, fi)}
                                        onDragOver={(e) => handleDragOverField(e, child.id, fi)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDropOnField(e, child.id, fi)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 11, background: isDragOver ? '#c8e6ff' : '#e8f4f8', border: isDragOver ? '2px solid #4a6cf7' : '1px solid #b8d8e8', cursor: 'grab', transition: 'background 0.15s, border 0.15s' }}>
                                        <GripVertical size={8} className="opacity-40" />
                                        <span style={{ fontWeight: 500 }}>{ff.label || ff.key}</span>
                                        <span className="text-xs text-gray-400">· {ff.type || 'text'}</span>
                                        <button className="btn btn-ghost btn-xs p-0" onClick={() => moveFieldInSection(child.id, fi, fi - 1)} disabled={fi === 0} style={{ padding: 0, minWidth: 'auto' }}>
                                          <ChevronUp size={9} />
                                        </button>
                                        <button className="btn btn-ghost btn-xs p-0" onClick={() => moveFieldInSection(child.id, fi, fi + 1)} disabled={fi === childFieldDetails.length - 1} style={{ padding: 0, minWidth: 'auto' }}>
                                          <ChevronDown size={9} />
                                        </button>
                                        <button className="btn btn-ghost btn-xs p-0 text-error" onClick={() => removeFieldFromSection(child.id, ff.key)} style={{ padding: 0, minWidth: 'auto' }}>
                                          <X size={9} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-2" style={{ minHeight: 40 }}
                      onDragOver={(e) => handleDragOverSectionBody(e, section.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDropOnSectionBody(e, section.id)}
                    >
                      {(section.fields || []).length === 0 ? (
                        <div
                          style={{ border: dragOverTarget?.sectionId === section.id ? '2px dashed #4a6cf7' : '1px dashed #d1d5db', borderRadius: 6, padding: '12px 8px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}
                        >
                          Kéo field từ danh sách bên phải vào đây
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(section.fields || []).map((fieldKey, fieldIdx) => {
                            const ff = findField(fieldKey);
                            const isDragOver = dragOverTarget?.type === 'field' && dragOverTarget?.sectionId === section.id && dragOverTarget?.idx === fieldIdx;
                            return (
                              <div
                                key={fieldKey}
                                className="field-chip"
                                draggable
                                onDragStart={(e) => startDragField(e, fieldKey, section.id, fieldIdx)}
                                onDragOver={(e) => handleDragOverField(e, section.id, fieldIdx)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDropOnField(e, section.id, fieldIdx)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  padding: '4px 8px', borderRadius: 6, fontSize: 12,
                                  background: isDragOver ? '#c8e6ff' : '#e8f4f8',
                                  border: isDragOver ? '2px solid #4a6cf7' : '1px solid #b8d8e8',
                                  cursor: 'grab',
                                  transition: 'background 0.15s, border 0.15s'
                                }}
                              >
                                <GripVertical size={10} className="opacity-40" />
                                <span style={{ fontWeight: 500 }}>{ff?.label || fieldKey}</span>
                                <span className="text-xs text-gray-400">· {ff?.type || 'text'}</span>
                                <button
                                  className="btn btn-ghost btn-xs p-0"
                                  onClick={() => moveFieldInSection(section.id, fieldIdx, fieldIdx - 1)}
                                  disabled={fieldIdx === 0}
                                  style={{ padding: 0, minWidth: 'auto' }}
                                >
                                  <ChevronUp size={10} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-xs p-0"
                                  onClick={() => moveFieldInSection(section.id, fieldIdx, fieldIdx + 1)}
                                  disabled={fieldIdx === (section.fields || []).length - 1}
                                  style={{ padding: 0, minWidth: 'auto' }}
                                >
                                  <ChevronDown size={10} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-xs p-0 text-error"
                                  onClick={() => removeFieldFromSection(section.id, fieldKey)}
                                  style={{ padding: 0, minWidth: 'auto' }}
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add section buttons */}
            <div style={{ textAlign: 'center', margin: '8px 0', display: 'flex', gap: 8, justifyContent: 'center' }}>
              {formSections.length > 0 && (
                <button className="btn btn-primary btn-sm gap-1" onClick={loadFromForm}>
                  Tải từ Form Proposals
                </button>
              )}
              <button className="btn btn-outline btn-primary btn-sm gap-1" onClick={addSection}>
                <Plus size={14} /> Thêm Section
              </button>
            </div>
          </div>
        </div>

        {/* Right: Available Fields */}
        <div className="builder-panel flex-1" style={{ flex: 1 }}>
          <div className="builder-panel-header">
            Available Fields ({availableFields.length})
          </div>
          <div className="builder-panel-body">
            {availableFields.length === 0 ? (
              <div className="builder-empty">Tất cả fields đã được thêm</div>
            ) : (
              availableFields.map(field => (
                <div
                  key={field.key}
                  className="builder-available-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', field.key);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragState({ type: 'field', fieldKey: field.key, sourceSectionId: null, fieldIdx: -1 });
                  }}
                  onClick={() => {
                    if (template.sections.length > 0) {
                      addFieldToSection(template.sections[0].id, field.key);
                    }
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{field.label}</strong>
                    <div className="text-xs text-gray-400">{field.key} · {field.type}</div>
                  </div>
                  <Plus size={16} className="text-indigo-500" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-4">
        <button className="btn btn-outline btn-sm gap-1" onClick={addSection}>
          <Plus size={14} /> Thêm Section
        </button>
        <div className="flex-1" />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Hủy</button>
        <button
          className="btn btn-primary btn-sm gap-1"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={14} />}
          Lưu Template
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl max-h-[80vh]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">HTML Preview — Proposal #{proposalId}</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowPreview(false)}>
                <X size={18} />
              </button>
            </div>
            <div
              className="bg-white p-4 rounded border border-base-300 overflow-auto max-h-[60vh]"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            <div className="modal-action">
              <button className="btn btn-sm" onClick={() => setShowPreview(false)}>Đóng</button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setShowPreview(false)} />
        </div>
      )}
    </div>
  );
};

export default TemplateEditor;
