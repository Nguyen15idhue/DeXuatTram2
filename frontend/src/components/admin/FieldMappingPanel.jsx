import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldMappingService } from '../../services/api';
import Toast from '../Toast';
import { ArrowRightLeft, X, Info, Search, Download, AlertTriangle, Paperclip, FileText, GripVertical } from 'lucide-react';

const TYPE_LABELS = {
  text: 'Text', textarea: 'Textarea', number: 'Number', email: 'Email',
  phone: 'Phone', url: 'URL', date: 'Date', datetime: 'Datetime',
  boolean: 'Boolean', select: 'Select', multiselect: 'Multiselect',
  file: 'File', formula: 'Formula', password: 'Password', table: 'Table', json: 'JSON'
};

const TYPE_COLORS = {
  text: 'badge-primary', textarea: 'badge-primary', number: 'badge-secondary',
  email: 'badge-accent', phone: 'badge-accent', url: 'badge-info',
  date: 'badge-warning', datetime: 'badge-warning', boolean: 'badge-success',
  select: 'badge-info', multiselect: 'badge-info', file: 'badge-error',
  formula: 'badge-secondary', password: 'badge-error', table: 'badge-ghost', json: 'badge-ghost'
};

const TYPE_FORMATS = {
  text: 'String', textarea: 'String (text dài)', number: 'Number',
  email: 'Email format', phone: 'String (số điện thoại)', url: 'URL format',
  date: 'DD/MM/YYYY', datetime: 'DD/MM/YYYY HH:mm', boolean: 'true/false hoặc 1/0',
  select: 'String (chọn 1)', multiselect: 'Array hoặc comma-separated',
  file: 'Base64 hoặc URL', formula: 'Tự tính', password: 'String', table: 'JSON Array', json: 'JSON'
};

const getFieldInfo = (field, savedMeta) => {
  const meta = savedMeta && savedMeta[field.key] ? savedMeta[field.key] : {};
  const key = field.key;
  const type = field.type || 'text';
  let desc = meta.description || '';
  let example = meta.example || '';
  let format = meta.format || TYPE_FORMATS[type] || 'String';
  if (!desc) {
    if (key.endsWith('_id')) desc = `ID liên kết (${key.replace('_id', '')})`;
    else if (key === 'code') desc = 'Mã liên hệ duy nhất';
    else if (key === 'type') desc = 'Loại liên hệ (personal/organization)';
    else if (key === 'name') desc = 'Tên liên hệ';
    else if (key === 'phones') desc = 'Số điện thoại';
    else if (key === 'emails') desc = 'Địa chỉ email';
    else if (key === 'address') desc = 'Địa chỉ';
    else if (key === 'desc') desc = 'Mô tả/Ghi chú (nguồn: Desc Template)';
    else if (key === 'files') desc = 'Tệp đính kèm (gộp mọi file của đề xuất)';
    else if (key.startsWith('cf')) desc = `Trường tùy chỉnh ${key}`;
    else if (key.includes('date')) desc = 'Ngày tháng';
    else if (key.includes('name')) desc = 'Tên';
    else if (key.includes('status')) desc = 'Trạng thái';
    else desc = `Trường ${key}`;
  }
  if (!example) {
    if (type === 'text') example = 'Giá trị text';
    else if (type === 'number') example = '123';
    else if (type === 'email') example = 'example@email.com';
    else if (type === 'phone') example = '0901234567';
    else if (type === 'date') example = '01/01/2025';
    else if (type === 'select') example = 'option1';
    else if (type === 'boolean') example = 'true';
    else example = '...';
  }
  return { desc, example, format };
};

const SPECIAL_LABELS = {
  desc: 'Mô tả (Desc Template)',
  files: 'Tệp đính kèm (files)'
};

const FieldMappingPanel = ({ configId, onClose }) => {
  const { token } = useAuth();
  const [proposalFields, setProposalFields] = useState([]);
  const [contactFields, setContactFields] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingProposal, setFetchingProposal] = useState(false);
  const [fetchingContact, setFetchingContact] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [fieldMetadata, setFieldMetadata] = useState({});
  const [usedInDescFields, setUsedInDescFields] = useState([]);
  const [dragKey, setDragKey] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const mapRes = await fieldMappingService.getAllByConfig(configId, token);
      if (mapRes.success) setMappings(mapRes.data || []);

      const typeRes = await fieldMappingService.getTypes(token, configId);
      if (typeRes.success) setContactFields(typeRes.data.oneOfficeFields || []);

      const sfRes = await fieldMappingService.getSelectedFields(configId, token);
      if (sfRes.success) setProposalFields(sfRes.data || []);

      const usedRes = await fieldMappingService.getUsedInDesc(configId, token);
      if (usedRes.success) setUsedInDescFields(usedRes.data || []);

      const cfgRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/admin/api-configs/${configId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const cfgData = await cfgRes.json();
      if (cfgData.success && cfgData.data && cfgData.data.field_metadata) {
        const meta = typeof cfgData.data.field_metadata === 'string'
          ? JSON.parse(cfgData.data.field_metadata)
          : cfgData.data.field_metadata;
        setFieldMetadata(meta || {});
      }
    } catch {
      setToast({ message: 'Lỗi tải dữ liệu mapping', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [configId, token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const fetchProposalFields = async () => {
    setFetchingProposal(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/field-definitions?entity=station_proposals&status=active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setProposalFields(prev => {
          const existingKeys = new Set(prev.map(f => f.key));
          const newFields = data.data.filter(f => !existingKeys.has(f.key));
          const allFields = [...prev, ...newFields];
          fieldMappingService.updateSelectedFields(configId, allFields, token).catch(() => {});
          setToast({ message: newFields.length > 0 ? `Đã tải ${newFields.length} trường mới` : 'Không có trường mới', type: newFields.length ? 'success' : 'info' });
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
        setContactFields(res.data.oneOfficeFields || []);
        setToast({ message: 'Đã tải lại trường 1Office', type: 'success' });
      }
    } catch {
      setToast({ message: 'Lỗi tải 1Office fields', type: 'error' });
    } finally {
      setFetchingContact(false);
    }
  };

  const fieldByKey = useCallback((key) => proposalFields.find(f => f.key === key), [proposalFields]);
  const countBySource = useCallback((key) => mappings.filter(m => m.source_field === key).length, [mappings]);
  const mappingByTarget = useCallback((key) => mappings.find(m => m.target_field === key), [mappings]);

  const normalLinked = mappings.filter(m => !['desc', 'files'].includes(m.target_field));
  const linkedTargetKeys = new Set(mappings.map(m => m.target_field));
  const fileFieldCount = proposalFields.filter(f => f.type === 'file').length;

  const unlinkedFields = contactFields.filter(f => !linkedTargetKeys.has(f.key) && !f.special);

  const handleDrop = async (target) => {
    const srcKey = dragKey;
    setDragKey(null);
    setDragOverTarget(null);
    if (!srcKey) return;
    if (target.special || target.unsupported) return;
    const src = fieldByKey(srcKey);
    if (!src) return;

    const existing = mappingByTarget(target.key);
    setSavingId(target.key);
    try {
      if (existing) {
        if (existing.source_field === src.key) return;
        const res = await fieldMappingService.update(existing.id, {
          source_field: src.key,
          target_field: target.key,
          target_field_type: target.type
        }, token);
        if (res.success) {
          setMappings(prev => prev.map(m => m.id === existing.id ? res.data : m));
          setToast({ message: `Đã đổi "${target.label || target.key}" ← ${src.label}`, type: 'success' });
        } else {
          setToast({ message: res.message || 'Lỗi lưu mapping', type: 'error' });
        }
      } else {
        const res = await fieldMappingService.create(configId, {
          source_field: src.key,
          target_field: target.key,
          target_field_type: target.type,
          sync_enabled: true,
          direction: 'both'
        }, token);
        if (res.success) {
          setMappings(prev => [...prev, res.data]);
          setToast({ message: `Đã link "${src.label}" → "${target.label || target.key}"`, type: 'success' });
        } else {
          setToast({ message: res.message || 'Lỗi lưu mapping', type: 'error' });
        }
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  const handleUnlink = async (mapping) => {
    setSavingId(mapping.target_field);
    try {
      const res = await fieldMappingService.delete(mapping.id, token);
      if (res.success) {
        setMappings(prev => prev.filter(m => m.id !== mapping.id));
        setToast({ message: `Đã bỏ link "${mapping.target_field}"`, type: 'success' });
      } else {
        setToast({ message: res.message || 'Lỗi xóa mapping', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  const filteredUnlinked = unlinkedFields.filter(f => {
    if (!contactSearch) return true;
    const q = contactSearch.toLowerCase();
    return (f.label && f.label.toLowerCase().includes(q)) || (f.key && f.key.toLowerCase().includes(q));
  });

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {showInfo && selectedInfo && (() => {
        const info = getFieldInfo(selectedInfo.field, fieldMetadata);
        return (
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
                <div className="flex items-start gap-2">
                  <span className="font-medium shrink-0">Mô tả:</span>
                  <span className="flex-1">{info.desc}</span>
                </div>
                <div><span className="font-medium">Định dạng:</span> <code className="bg-base-200 px-1 rounded text-xs">{info.format}</code></div>
                <div>
                  <span className="font-medium">Ví dụ:</span>
                  <div className="bg-base-200 p-2 rounded text-xs mt-1">{info.example}</div>
                </div>
                {selectedInfo.field.unsupported && (
                  <div className="alert alert-warning py-1 text-xs">Trường này 1Office không lưu — không nên kéo–thả.</div>
                )}
              </div>
              <div className="modal-action">
                <button className="btn btn-sm" onClick={() => setShowInfo(false)}>Đóng</button>
              </div>
            </div>
            <div className="modal-backdrop bg-black/50" onClick={() => setShowInfo(false)} />
          </div>
        );
      })()}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={20} className="text-primary" />
          <h3 className="text-lg font-bold">Field Mappings</h3>
          <span className="badge badge-sm">{mappings.length} linked</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}><X size={16} /></button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="card-title text-sm">Proposal Fields (Nguồn)</h4>
              <button className={`btn btn-outline btn-primary btn-xs gap-1 ${fetchingProposal ? 'loading' : ''}`} onClick={fetchProposalFields} disabled={fetchingProposal}>
                <Download size={12} /> Get
              </button>
            </div>
            <p className="text-xs text-base-content/50 mb-2">Kéo trường sang bên phải để link. Số trên badge là số trường đích đã link.</p>
            {proposalFields.length === 0 ? (
              <div className="text-center py-8 text-base-content/40 text-sm">Nhấn "Get" để tải danh sách trường</div>
            ) : (
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                {proposalFields.map((field) => {
                  const count = countBySource(field.key);
                  const isUsedInDesc = usedInDescFields.includes(field.key);
                  return (
                    <div
                      key={field.key}
                      data-field-key={field.key}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', field.key); setDragKey(field.key); }}
                      onDragEnd={() => { setDragKey(null); setDragOverTarget(null); }}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-sm cursor-grab active:cursor-grabbing bg-base-100 hover:border-primary ${dragKey === field.key ? 'opacity-50 border-primary' : 'border-base-300'}`}
                    >
                      <GripVertical size={14} className="text-base-content/30 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate">{field.label}</span>
                          {field.required ? <span className="text-error text-xs">*</span> : null}
                          <span className={`badge badge-xs ${TYPE_COLORS[field.type] || 'badge-ghost'}`}>{TYPE_LABELS[field.type] || field.type}</span>
                          {count > 0 && (
                            <span data-count-key={field.key} className="badge badge-xs badge-success" title={`Đã link ${count} trường đích`}>
                              ^ {count}
                            </span>
                          )}
                          {isUsedInDesc && (
                            <span className="badge badge-xs badge-warning gap-0.5" title="Đang dùng trong Desc Template">
                              <AlertTriangle size={10} /> Desc
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-base-content/50">{field.key}</span>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={() => { setSelectedInfo({ field }); setShowInfo(true); }}>
                        <Info size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="card-title text-sm">Contact Fields (1Office)</h4>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-base-content/40" />
                  <input type="text" className="input input-bordered input-xs pl-7 w-32" placeholder="Tìm trường..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
                </div>
                <button className={`btn btn-outline btn-primary btn-xs gap-1 ${fetchingContact ? 'loading' : ''}`} onClick={fetchContactFields} disabled={fetchingContact}>
                  <Download size={12} /> Get
                </button>
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold text-success uppercase">Đã link ({normalLinked.length + 2})</div>
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center gap-2 p-2 rounded-lg border border-success bg-success/5 text-sm">
                <FileText size={14} className="text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{SPECIAL_LABELS.desc}</span>
                    <span className={`badge badge-xs ${TYPE_COLORS.textarea}`}>Textarea</span>
                  </div>
                  <span className="text-xs text-base-content/50">← Desc Template (cố định)</span>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg border border-success bg-success/5 text-sm">
                <Paperclip size={14} className="text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{SPECIAL_LABELS.files}</span>
                    <span className={`badge badge-xs ${TYPE_COLORS.json}`}>JSON</span>
                  </div>
                  <span className="text-xs text-base-content/50">← Tất cả file đề xuất ({fileFieldCount} trường file) (cố định)</span>
                </div>
              </div>

              {normalLinked.map((m) => {
                const src = fieldByKey(m.source_field);
                const targetDef = contactFields.find(f => f.key === m.target_field);
                return (
                  <div
                    key={m.id}
                    data-linked-key={m.target_field}
                    onDragOver={(e) => { e.preventDefault(); setDragOverTarget(m.target_field); }}
                    onDragLeave={() => setDragOverTarget(t => t === m.target_field ? null : t)}
                    onDrop={(e) => { e.preventDefault(); handleDrop({ key: m.target_field, type: m.target_field_type, label: targetDef?.label }); }}
                    className={`flex items-center gap-2 p-2 rounded-lg border border-success bg-success/5 text-sm ${dragOverTarget === m.target_field ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{targetDef?.label || m.target_field}</span>
                        <span className={`badge badge-xs ${TYPE_COLORS[m.target_field_type] || 'badge-ghost'}`}>{TYPE_LABELS[m.target_field_type] || m.target_field_type}</span>
                      </div>
                      <span className="text-xs text-base-content/50">← {src ? src.label : m.source_field} ({m.source_field})</span>
                    </div>
                    <button data-unlink={m.target_field} className="btn btn-ghost btn-xs text-error" onClick={() => handleUnlink(m)} disabled={savingId === m.target_field}>
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mb-2 text-xs font-semibold text-base-content/60 uppercase">Chưa link ({filteredUnlinked.length})</div>
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {filteredUnlinked.map((field) => {
                const disabled = field.unsupported;
                return (
                  <div
                    key={field.key}
                    data-target-key={field.key}
                    data-unsupported={disabled ? '1' : '0'}
                    onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragOverTarget(field.key); } }}
                    onDragLeave={() => setDragOverTarget(t => t === field.key ? null : t)}
                    onDrop={(e) => { e.preventDefault(); handleDrop(field); }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${disabled ? 'border-base-200 bg-base-200/40 opacity-60 cursor-not-allowed' : 'border-dashed border-base-300 bg-base-100'} ${dragOverTarget === field.key ? 'border-primary bg-primary/10' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium truncate">{field.label || field.key}</span>
                        <span className={`badge badge-xs ${TYPE_COLORS[field.type] || 'badge-ghost'}`}>{TYPE_LABELS[field.type] || field.type}</span>
                        {disabled && <span className="badge badge-xs badge-warning">1Office không lưu</span>}
                      </div>
                      <span className="text-xs text-base-content/50">{field.key}</span>
                    </div>
                    <button className="btn btn-ghost btn-xs" onClick={() => { setSelectedInfo({ field }); setShowInfo(true); }}>
                      <Info size={14} />
                    </button>
                  </div>
                );
              })}
              {filteredUnlinked.length === 0 && (
                <div className="text-center py-4 text-base-content/40 text-sm">Không còn trường trống</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldMappingPanel;
