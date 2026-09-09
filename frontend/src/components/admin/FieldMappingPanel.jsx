import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldMappingService } from '../../services/api';
import Toast from '../Toast';
import { ArrowRightLeft, Save, X, ToggleLeft, ToggleRight, Info, Search, Download } from 'lucide-react';

const TYPE_LABELS = {
  text: 'Text', textarea: 'Textarea', number: 'Number', email: 'Email',
  phone: 'Phone', url: 'URL', date: 'Date', datetime: 'Datetime',
  boolean: 'Boolean', select: 'Select', multiselect: 'Multiselect',
  file: 'File', formula: 'Formula', password: 'Password', table: 'Table'
};

const TYPE_COLORS = {
  text: 'badge-primary', textarea: 'badge-primary', number: 'badge-secondary',
  email: 'badge-accent', phone: 'badge-accent', url: 'badge-info',
  date: 'badge-warning', datetime: 'badge-warning', boolean: 'badge-success',
  select: 'badge-info', multiselect: 'badge-info', file: 'badge-error',
  formula: 'badge-secondary', password: 'badge-error', table: 'badge-ghost'
};

const FieldMappingPanel = ({ configId, onClose }) => {
  const { token } = useAuth();
  const [proposalFields, setProposalFields] = useState([]);
  const [contactFields, setContactFields] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingProposal, setFetchingProposal] = useState(false);
  const [fetchingContact, setFetchingContact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [editingFieldKey, setEditingFieldKey] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const searchRef = useRef(null);

  const loadMappings = useCallback(async () => {
    try {
      const res = await fieldMappingService.getAllByConfig(configId, token);
      if (res.success && res.data && res.data.length > 0) {
        setMappings(res.data);
      }

      try {
        const tmRes = await fieldMappingService.getTypes(token, configId);
        if (tmRes.success) {
          const allFields = tmRes.data.oneOfficeFields || [];
          if (allFields.length > 0) setContactFields(allFields);
        }
      } catch {}

      try {
        const sfRes = await fieldMappingService.getSelectedFields(configId, token);
        if (sfRes.success && sfRes.data && sfRes.data.length > 0) {
          setProposalFields(sfRes.data);
        }
      } catch {}
    } catch {
      setToast({ message: 'Lỗi tải mappings', type: 'error' });
    }
  }, [configId, token]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const fetchProposalFields = async () => {
    setFetchingProposal(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/field-definitions?entity=station_proposals&status=active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setProposalFields(prev => {
          const existingKeys = new Set(prev.map(f => f.key));
          const newFields = data.data.filter(f => !existingKeys.has(f.key));
          const allFields = [...prev, ...newFields];
          fieldMappingService.updateSelectedFields(configId, allFields, token).catch(() => {});
          if (newFields.length > 0) {
            setToast({ message: `Đã tải ${newFields.length} trường mới`, type: 'success' });
          } else {
            setToast({ message: 'Không có trường mới', type: 'info' });
          }
          return allFields;
        });
      }
    } catch {
      setToast({ message: 'Lỗi tải field definitions', type: 'error' });
    } finally {
      setFetchingProposal(false);
    }
  };

  const fetchContactFields = async () => {
    setFetchingContact(true);
    try {
      const res = await fieldMappingService.getTypes(token, configId);
      if (res.success) {
        const apiFields = res.data.oneOfficeFields || [];
        setContactFields(prev => {
          const existingKeys = new Set(prev.map(f => f.key));
          const newFields = apiFields.filter(f => !existingKeys.has(f.key));
          if (newFields.length > 0) {
            setToast({ message: `Đã tải ${newFields.length} trường mới`, type: 'success' });
            return [...prev, ...newFields];
          }
          setToast({ message: 'Không có trường mới', type: 'info' });
          return prev;
        });
      }
    } catch {
      setToast({ message: 'Lỗi tải 1Office fields', type: 'error' });
    } finally {
      setFetchingContact(false);
    }
  };

  const getMappingForSource = (sourceKey) => mappings.find(m => m.source_field === sourceKey);

  const handleToggle = async (mapping) => {
    try {
      const res = await fieldMappingService.update(mapping.id, { sync_enabled: !mapping.sync_enabled }, token);
      if (res.success) {
        setMappings(prev => prev.map(m => m.id === mapping.id ? { ...m, sync_enabled: m.sync_enabled ? 0 : 1 } : m));
      }
    } catch {
      setToast({ message: 'Lỗi cập nhật', type: 'error' });
    }
  };

  const handleTargetChange = async (mapping, newTarget) => {
    const targetField = contactFields.find(f => f.key === newTarget);
    try {
      const res = await fieldMappingService.update(mapping.id, {
        target_field: newTarget,
        target_field_type: targetField ? targetField.type : 'text'
      }, token);
      if (res.success) {
        setMappings(prev => prev.map(m => m.id === mapping.id ? {
          ...m, target_field: newTarget, target_field_type: targetField ? targetField.type : 'text'
        } : m));
      }
    } catch {
      setToast({ message: 'Lỗi cập nhật', type: 'error' });
    }
  };

  const handleCreateMapping = async (sourceField) => {
    try {
      const res = await fieldMappingService.create(configId, {
        source_field: sourceField.key,
        target_field: '',
        target_field_type: 'text',
        sync_enabled: true,
        direction: 'both'
      }, token);
      if (res.success) {
        setMappings(prev => [...prev, res.data]);
        setToast({ message: `Đã thêm mapping cho "${sourceField.label}"`, type: 'success' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tạo mapping', type: 'error' });
    }
  };

  const handleDeleteMapping = async (mappingId) => {
    try {
      const res = await fieldMappingService.delete(mappingId, token);
      if (res.success) {
        setMappings(prev => prev.filter(m => m.id !== mappingId));
        setToast({ message: 'Đã xóa mapping', type: 'success' });
      }
    } catch {
      setToast({ message: 'Lỗi xóa mapping', type: 'error' });
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await loadMappings();
      setToast({ message: 'Đã lưu tất cả mappings', type: 'success' });
    } catch {
      setToast({ message: 'Lỗi lưu', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleShowInfo = (field, source) => {
    setSelectedInfo({ field, source });
    setShowInfo(true);
  };

  const handleLabelEdit = (field) => {
    setEditingFieldKey(field.key);
    setEditingLabel(field.label);
  };

  const handleLabelSave = async (fieldKey) => {
    try {
      const res = await fieldMappingService.updateMetadata(configId, { [fieldKey]: { label: editingLabel } }, token);
      if (res.success) {
        setContactFields(prev => prev.map(f => f.key === fieldKey ? { ...f, label: editingLabel } : f));
        setEditingFieldKey(null);
        setToast({ message: 'Đã cập nhật label', type: 'success' });
      }
    } catch {
      setToast({ message: 'Lỗi cập nhật label', type: 'error' });
    }
  };

  const handleLabelKeyDown = (e, fieldKey) => {
    if (e.key === 'Enter') handleLabelSave(fieldKey);
    if (e.key === 'Escape') setEditingFieldKey(null);
  };

  const filteredContactFields = contactFields.filter(f => {
    if (!contactSearch) return true;
    const q = contactSearch.toLowerCase();
    return (f.label && f.label.toLowerCase().includes(q)) || (f.key && f.key.toLowerCase().includes(q));
  });

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Info Modal */}
      {showInfo && selectedInfo && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">{selectedInfo.field.label || selectedInfo.field.key}</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowInfo(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Key:</span> <code className="bg-base-200 px-1 rounded">{selectedInfo.field.key}</code></div>
              <div><span className="font-medium">Type:</span> <span className={`badge badge-xs ${TYPE_COLORS[selectedInfo.field.type] || 'badge-ghost'}`}>{TYPE_LABELS[selectedInfo.field.type] || selectedInfo.field.type}</span></div>
              {selectedInfo.field.required !== undefined && (
                <div><span className="font-medium">Required:</span> {selectedInfo.field.required ? <span className="text-error">Yes *</span> : 'No'}</div>
              )}
              {selectedInfo.field.entity && (
                <div><span className="font-medium">Entity:</span> {selectedInfo.field.entity}</div>
              )}
              {selectedInfo.field.source_type && (
                <div><span className="font-medium">Source:</span> {selectedInfo.field.source_type}</div>
              )}
              {selectedInfo.source === 'contact' && selectedInfo.field.example && (
                <div>
                  <span className="font-medium">Ví dụ:</span>
                  <pre className="bg-base-200 p-2 rounded text-xs mt-1 overflow-x-auto">{selectedInfo.field.example}</pre>
                </div>
              )}
              {selectedInfo.source === 'proposal' && (
                <div>
                  <span className="font-medium">Ví dụ JSON:</span>
                  <pre className="bg-base-200 p-2 rounded text-xs mt-1 overflow-x-auto">{`{
  "key": "${selectedInfo.field.key}",
  "label": "${selectedInfo.field.label}",
  "type": "${selectedInfo.field.type}",
  "required": ${selectedInfo.field.required || false},
  "source_type": "${selectedInfo.field.source_type || 'json'}"
}`}</pre>
                </div>
              )}
            </div>
            <div className="modal-action">
              <button className="btn btn-sm" onClick={() => setShowInfo(false)}>Đóng</button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setShowInfo(false)} />
        </div>
      )}

      {/* Header with Save/Cancel */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={20} className="text-primary" />
          <h3 className="text-lg font-bold">Field Mappings</h3>
          <span className="badge badge-sm">{mappings.length} mapped</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Hủy</button>
          <button className={`btn btn-primary btn-sm gap-1 ${saving ? 'loading' : ''}`} onClick={handleSaveAll} disabled={saving}>
            <Save size={14} />
            Lưu
          </button>
        </div>
      </div>

      {/* 2-Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Proposal Fields */}
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="card-title text-sm">Proposal Fields (Nguồn)</h4>
              <button
                className={`btn btn-outline btn-primary btn-xs gap-1 ${fetchingProposal ? 'loading' : ''}`}
                onClick={fetchProposalFields}
                disabled={fetchingProposal}
              >
                <Download size={12} />
                Get
              </button>
            </div>

            {proposalFields.length === 0 ? (
              <div className="text-center py-8 text-base-content/40 text-sm">
                Nhấn "Get" để tải danh sách trường từ field definitions
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {proposalFields.map((field) => {
                  const mapping = getMappingForSource(field.key);
                  return (
                    <div key={field.key} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${mapping ? 'border-primary bg-primary/5' : 'border-base-300'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{field.label}</span>
                          {field.required ? <span className="text-error text-xs">*</span> : null}
                          <span className={`badge badge-xs ${TYPE_COLORS[field.type] || 'badge-ghost'}`}>{TYPE_LABELS[field.type] || field.type}</span>
                        </div>
                        <span className="text-xs text-base-content/50">{field.key}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button className="btn btn-ghost btn-xs" onClick={() => handleShowInfo(field, 'proposal')}>
                          <Info size={14} />
                        </button>
                        {mapping ? (
                          <>
                            <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(mapping)}>
                              {mapping.sync_enabled ? <ToggleRight size={16} className="text-success" /> : <ToggleLeft size={16} className="text-base-content/30" />}
                            </button>
                            <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDeleteMapping(mapping.id)}>
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <button className="btn btn-outline btn-primary btn-xs" onClick={() => handleCreateMapping(field)}>
                            + Thêm
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Contact Fields (1Office) */}
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="card-title text-sm">Contact Fields (1Office)</h4>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-base-content/40" />
                  <input
                    ref={searchRef}
                    type="text"
                    className="input input-bordered input-xs pl-7 w-36"
                    placeholder="Tìm trường..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                  />
                </div>
                <button
                  className={`btn btn-outline btn-primary btn-xs gap-1 ${fetchingContact ? 'loading' : ''}`}
                  onClick={fetchContactFields}
                  disabled={fetchingContact}
                >
                  <Download size={12} />
                  Get
                </button>
              </div>
            </div>

            {contactFields.length === 0 ? (
              <div className="text-center py-8 text-base-content/40 text-sm">
                Nhấn "Get" để tải danh sách trường từ 1Office
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {filteredContactFields.map((field) => {
                  const isRequired = field.required;
                  const mapping = mappings.find(m => m.target_field === field.key);
                  return (
                    <div key={field.key} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${mapping ? 'border-success bg-success/5' : 'border-base-300'}`}>
                      {/* Left: Field info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {editingFieldKey === field.key ? (
                            <input
                              type="text"
                              className="input input-bordered input-xs flex-1"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              onBlur={() => handleLabelSave(field.key)}
                              onKeyDown={(e) => handleLabelKeyDown(e, field.key)}
                              autoFocus
                            />
                          ) : (
                            <span
                              className="font-medium truncate cursor-pointer hover:text-primary"
                              onDoubleClick={() => handleLabelEdit(field)}
                              title="Double-click để sửa label"
                            >
                              {field.label}
                            </span>
                          )}
                          {isRequired && <span className="text-error text-xs">*</span>}
                          <span className={`badge badge-xs ${TYPE_COLORS[field.type] || 'badge-ghost'}`}>{TYPE_LABELS[field.type] || field.type}</span>
                        </div>
                        <span className="text-xs text-base-content/50">{field.key}</span>
                      </div>

                      {/* Right: Dropdown select */}
                      <div className="flex items-center gap-1">
                        <select
                          className="select select-bordered select-xs w-44"
                          value={mapping ? mapping.source_field : ''}
                          onChange={(e) => {
                            if (e.target.value && mapping) {
                              handleTargetChange(mapping, field.key);
                            }
                          }}
                        >
                          <option value="">-- Chọn nguồn --</option>
                          {proposalFields.map(pf => (
                            <option key={pf.key} value={pf.key}>{pf.label}</option>
                          ))}
                        </select>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleShowInfo(field, 'contact')}>
                          <Info size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {contactSearch && filteredContactFields.length === 0 && (
                  <div className="text-center py-4 text-base-content/40 text-sm">
                    Không tìm thấy trường "{contactSearch}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldMappingPanel;
