import { useState, useEffect, useMemo } from 'react';
import { leadService, dynamicService, formService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import FieldRenderer from '../dynamic/FieldRenderer';
import DynamicForm from '../dynamic/DynamicForm';
import LeadJourneyPopup from './LeadJourneyPopup';
import LeadAssignDialog from './LeadAssignDialog';
import Toast from '../Toast';
import { X, Pencil, Save, MapPinned, FilePlus2, Route, Split } from 'lucide-react';
import useDataListMap from '../../hooks/useDataListMap';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import { collectTableDatalistIds } from '../../utils/tableColumnSource';

const parseJson = (v, fallback) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const getFieldValue = (rec, field) => {
  if (!rec) return '';
  const key = field.field_key || field.key;
  if (rec[key] !== undefined && rec[key] !== null && rec[key] !== '') return rec[key];
  const cd = rec.custom_data && typeof rec.custom_data === 'object' ? rec.custom_data : null;
  if (cd && cd[key] !== undefined) return cd[key];
  return rec[key];
};

const LeadDetailPopup = ({ recordId, mode: modeProp = 'view', onClose, onSaved, onSwitchMode }) => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const leadsViewId = useDefaultViewId('leads', null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [record, setRecord] = useState(null);
  const [mode, setMode] = useState(modeProp);
  const [viewFields, setViewFields] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [formConfig, setFormConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  useEffect(() => { setMode(modeProp); }, [modeProp]);

  const dataListIds = useMemo(() => {
    const ids = new Set([...viewFields, ...allFields].map(f => f.data_list_id).filter(Boolean));
    [...viewFields, ...allFields].forEach(f => {
      if (f.type !== 'table') return;
      const tc = parseJson(f.source_config, {});
      (tc.columns || []).forEach(col => { for (const id of collectTableDatalistIds([col], allFields)) ids.add(id); });
    });
    return [...ids];
  }, [viewFields, allFields]);
  const dataListOptions = useDataListMap(dataListIds);

  useEffect(() => {
    if (!recordId || !token) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await leadService.getById(recordId, token);
        if (cancelled) return;
        if (!res.success) { setError(res.message || 'Không tìm thấy Lead'); return; }
        setRecord(res.data);
      } catch {
        if (!cancelled) setError('Lỗi tải Lead');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [recordId, token]);

  useEffect(() => {
    if (!leadsViewId || !token) return;
    let cancelled = false;
    dynamicService.getViewConfig('leads', leadsViewId)
      .then(res => {
        if (cancelled || !res || !res.success) return;
        setViewFields(res.data.fields || []);
        setAllFields(res.data.allFields || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leadsViewId, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    formService.getByEntityAndPurpose('leads', 'view')
      .then(async (formRes) => {
        if (cancelled || !formRes.success || !formRes.data) return;
        const lc = parseJson(formRes.data.layout_config, null);
        const full = await formService.getById(formRes.data.id).catch(() => null);
        if (cancelled) return;
        setFormConfig({ ...formRes.data, layout_config: lc, fields: full && full.success ? full.data.fields : [] });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const fieldsByKey = useMemo(() => {
    const map = {};
    [...viewFields, ...allFields].forEach(f => { map[f.field_key || f.key] = f; });
    return map;
  }, [viewFields, allFields]);

  const layout = useMemo(() => {
    if (!formConfig?.layout_config?.sections) return null;
    const rawSections = formConfig.layout_config.sections || [];
    const sectionMap = {};
    rawSections.forEach(s => { if (s && s.id) sectionMap[s.id] = s; });
    const cellMap = {};
    (formConfig.fields || []).forEach(f => {
      const cfg = parseJson(f.config, null);
      if (cfg && cfg.rowId != null && cfg.colIndex != null) {
        cellMap[`${cfg.rowId}-${cfg.colIndex}`] = fieldsByKey[f.key || f.field_key] || null;
      }
    });
    return { sections: rawSections, sectionMap, cellMap };
  }, [formConfig, fieldsByKey]);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      const res = await leadService.update(recordId, formData, token);
      if (res.success) {
        setRecord(res.data);
        setToast({ message: 'Cập nhật Lead thành công', type: 'success' });
        if (onSaved) onSaved();
        setMode('view');
        if (onSwitchMode) onSwitchMode('view');
      } else {
        throw new Error(res.message || 'Cập nhật thất bại');
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi cập nhật', type: 'error' });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const prefillProposal = record ? {
    owner_name: record.full_name || '',
    owner_phone: record.phone || '',
    address: record.address || '',
    province: record.province || '',
    xa_phuong: record.ward || '',
    ma_tinh: record.province_code || '',
    vung_mien: record.region || ''
  } : {};

  const handleCreateProposal = async (formData) => {
    setCreatingProposal(true);
    const idem = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `idem_${Date.now()}`;
    try {
      const res = await leadService.createProposal(recordId, formData, token, idem);
      if (res.success) {
        const pid = res.data && res.data.id;
        setToast({ message: res.message || 'Tạo đề xuất thành công', type: 'success' });
        setShowCreateProposal(false);
        if (pid) navigate(`/admin/proposals/view=${pid}`);
      } else {
        throw new Error(res.message || 'Tạo đề xuất thất bại');
      }
    } catch (err) {
      setToast({ message: err.message || 'Lỗi tạo đề xuất', type: 'error' });
      throw err;
    } finally {
      setCreatingProposal(false);
    }
  };

  const renderFieldInput = (field) => {
    const key = field.field_key || field.key;
    const value = getFieldValue(record, field);
    return <FieldRenderer field={field} value={value} entity="leads" entityId={record.id} dataListOptions={dataListOptions} expandTable />;
  };

  const renderRows = (sec) => (sec.rows || []).map(row => {
    const cols = parseInt((row.columns || '1:1').split(':')[1]);
    return (
      <div key={row.id} className="form-row" style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {Array.from({ length: cols }).map((_, ci) => {
          const field = layout ? layout.cellMap[`${row.id}-${ci}`] : null;
          if (!field) return <div key={ci} style={{ flex: 1 }} />;
          const label = field.field_label || field.label;
          const isFullRow = field.type === 'table';
          return (
            <div key={ci} style={{ flex: isFullRow ? '1 1 100%' : 1, maxWidth: isFullRow ? '100%' : undefined }}>
              <label style={{ fontWeight: 500, fontSize: 13, color: '#374151', marginBottom: 4, display: 'block' }}>{label}</label>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', background: '#f8fafc', minHeight: 38 }}>
                {renderFieldInput(field)}
              </div>
            </div>
          );
        })}
      </div>
    );
  });

  const canCreateProposal = record && record.sales_outcome === 'SUCCESS';

  return (
    <div className="modal-overlay" onClick={mode === 'edit' ? undefined : onClose}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div className="legacy-modal legacy-modal-lg popup-detail" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <h2>Lead #{record ? record.id : ''} {mode === 'edit' && '(chỉnh sửa)'}</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm btn-outline gap-1" onClick={() => setShowJourney(true)} title="Xem hành trình Lead">
              <Route size={14} /> <span className="hidden sm:inline">Hành trình</span>
            </button>
            <button type="button" className="btn btn-sm btn-outline btn-primary gap-1" onClick={() => setShowAssign(true)} title="Phân chia Lead cho Giám đốc Khu vực">
              <Split size={14} /> <span className="hidden sm:inline">Phân chia Leads</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="popup-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: 16 }}>
          {loading && <div className="text-center py-6">Đang tải...</div>}
          {!loading && error && <div className="alert alert-error">{error}</div>}
          {!loading && !error && record && mode === 'view' && (
            layout ? (
              layout.sections.map(sec => (
                <fieldset key={sec.id} className="form-section" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                  {sec.title && <legend className="form-section-title" style={{ fontWeight: 600, padding: '0 6px' }}>{sec.title}</legend>}
                  {renderRows(sec)}
                </fieldset>
              ))
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewFields.map(f => (
                  <div key={f.key}>
                    <label style={{ fontWeight: 500, fontSize: 13, color: '#374151', marginBottom: 4, display: 'block' }}>{f.label}</label>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', background: '#f8fafc', minHeight: 38 }}>
                      {renderFieldInput(f)}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          {!loading && !error && record && mode === 'edit' && (
            <DynamicForm
              entity="leads"
              purpose="view"
              initialData={record}
              onSubmit={handleSave}
              hideActions
              htmlId="lead-edit-form"
            />
          )}
        </div>

        <div className="popup-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', padding: 12, borderTop: '1px solid #e2e8f0' }}>
          {mode === 'view' && (
            <>
              <button type="button" className="btn btn-sm btn-outline btn-primary gap-1" onClick={() => { setShowCreateProposal(true); }} disabled={!canCreateProposal} title={canCreateProposal ? 'Tạo đề xuất từ Lead' : 'Lead chưa TVBH thành công'}>
                <FilePlus2 size={14} /> Tạo đề xuất
              </button>
              <button type="button" className="btn btn-sm btn-warning gap-1" onClick={() => { setMode('edit'); if (onSwitchMode) onSwitchMode('edit'); }}>
                <Pencil size={14} /> Sửa
              </button>
            </>
          )}
          {mode === 'edit' && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('view'); if (onSwitchMode) onSwitchMode('view'); }} disabled={saving}>Hủy</button>
              <button type="submit" form="lead-edit-form" className="btn btn-primary btn-sm gap-1" disabled={saving}>
                <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>

      {showJourney && record && (
        <LeadJourneyPopup leadId={record.id} onClose={() => setShowJourney(false)} />
      )}

      <LeadAssignDialog
        open={showAssign && !!record}
        leads={record ? [record] : []}
        onClose={() => setShowAssign(false)}
        onDone={(res) => {
          setToast({ message: (res && res.message) || 'Phân chia Lead thành công', type: 'success' });
          if (record) {
            leadService.getById(record.id, token)
              .then(r => { if (r && r.success) setRecord(r.data); })
              .catch(() => {});
          }
          if (onSaved) onSaved();
        }}
      />

      {showCreateProposal && (
        <dialog className="modal modal-open" onCancel={(e) => e.preventDefault()}>
          <div className="modal-box max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Tạo đề xuất từ Lead #{record.id}</h3>
              <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowCreateProposal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-2 text-xs text-base-content/60">
              <MapPinned size={12} /> Tọa độ (Vĩ độ/Kinh độ) là bắt buộc — nhập trực tiếp trong form.
            </div>
            <DynamicForm
              entity="station_proposals"
              purpose="create"
              initialData={prefillProposal}
              onSubmit={handleCreateProposal}
            >
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreateProposal(false)} disabled={creatingProposal}>Hủy</button>
            </DynamicForm>
          </div>
          <div className="modal-backdrop" />
        </dialog>
      )}
    </div>
  );
};

export default LeadDetailPopup;
