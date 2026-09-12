import { useState, useEffect } from 'react';
import { dynamicService, formService, stationService, adminUserService, adminProposalService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import FieldRenderer from '../dynamic/FieldRenderer';
import DynamicField from '../dynamic/DynamicField';
import UserExternalPanel from './UserExternalPanel';
import LocationMapModal from '../LocationMapModal';
import { MapPinned } from 'lucide-react';
import { notifyBellRefresh } from '../layout/NotificationBell';
import useDataListMap from '../../hooks/useDataListMap';
import Toast from '../Toast';

const ENTITY_LABELS = {
  stations: 'Trạm',
  users: 'User',
  station_proposals: 'Đề xuất'
};

const ENTITY_SERVICES = {
  stations: stationService,
  users: adminUserService,
  station_proposals: adminProposalService
};

const DEFAULT_VIEW_IDS = { stations: 6, users: 7, station_proposals: 8 };

const RecordDetailPopup = ({ entity, recordId, viewId, mode: modeProp, record: recordProp, onClose, onSaved, onSwitchMode, allowEdit = true, updateService = null }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [viewFields, setViewFields] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [record, setRecord] = useState(recordProp || null);
  const [mode, setMode] = useState(modeProp || 'view');
  const [formData, setFormData] = useState({});
  const [formConfig, setFormConfig] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const dataListOptions = useDataListMap([...viewFields, ...allFields].map(f => f.data_list_id));

  useEffect(() => {
    if (modeProp) setMode(allowEdit ? modeProp : 'view');
  }, [modeProp, allowEdit]);

  useEffect(() => {
    if (!recordProp && recordId && entity) {
      loadRecord();
    } else if (recordProp) {
      setRecord(recordProp);
      setLoading(true);
      loadViewConfig(recordProp).finally(() => setLoading(false));
    }
  }, [entity, recordId, recordProp]);

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError('');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      let url;
      if (entity === 'stations') url = `${baseUrl}/stations/${recordId}`;
      else if (entity === 'users') url = `${baseUrl}/admin/users/${recordId}`;
      else url = `${baseUrl}/admin/proposals/${recordId}`;

      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setRecord(data.data);
        await loadViewConfig(data.data);
      } else {
        setError('Không tìm thấy bản ghi');
      }
    } catch (e) {
      setError('Lỗi tải bản ghi');
    } finally {
      setLoading(false);
    }
  };

  const loadViewConfig = async (recordData) => {
    const vId = viewId || DEFAULT_VIEW_IDS[entity];
    if (!vId) return;
    try {
      const res = await dynamicService.getViewConfig(entity, vId);
      if (res.success) {
        const vf = res.data.fields || [];
        const af = res.data.allFields || [];
        setViewFields(vf);
        setAllFields(af);
        initFormData(af, recordData || record);
      }
      try {
        const formRes = await formService.getByEntityAndPurpose(entity, 'view');
        if (formRes.success && formRes.data) {
          const lc = formRes.data.layout_config
            ? (typeof formRes.data.layout_config === 'string' ? JSON.parse(formRes.data.layout_config) : formRes.data.layout_config)
            : null;
          const fullFormRes = await formService.getById(formRes.data.id);
          setFormConfig({
            ...formRes.data,
            layout_config: lc,
            fields: fullFormRes.success ? fullFormRes.data.fields : []
          });
        }
      } catch {
        // no view form configured
      }
    } catch {
      // silent
    }
  };

  const initFormData = (fields, recordOverride) => {
    const rec = recordOverride || record;
    const data = {};
    (fields || []).forEach(f => {
      const key = f.key;
      if (rec) {
        data[key] = getFieldValue(rec, { key });
      } else {
        data[key] = '';
      }
    });
    setFormData(data);
  };

  const getFieldValue = (row, field) => {
    if (row[field.key] !== undefined && row[field.key] !== null) return row[field.key];
    if (row.custom_data) {
      try {
        const cd = typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : row.custom_data;
        return cd[field.key];
      } catch { return null; }
    }
    return null;
  };

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const getParentValue = (parentCol) => {
    if (formData[parentCol] !== undefined) return formData[parentCol];
    const all = [...viewFields, ...allFields];
    const parentDef = all.find(f => f.data_list_column === parentCol);
    if (parentDef) return formData[parentDef.field_key || parentDef.key];
    return undefined;
  };

  const resolveFieldOptions = (field) => {
    const dlId = field.data_list_id;
    if (dlId && dataListOptions[dlId]) {
      const { tree, unique } = dataListOptions[dlId];
      const col = field.data_list_column;
      if (col && unique[col]) {
        if (field.parent_field) {
          const parentVal = getParentValue(field.parent_field);
          if (!parentVal) return [];
          const parentCol = field.parent_field;
          if (parentCol && tree[parentCol] && tree[parentCol][parentVal]) {
            const seen = new Set();
            return tree[parentCol][parentVal]
              .filter(r => {
                const v = r._raw?.[col];
                if (v && !seen.has(v)) { seen.add(v); return true; }
                return false;
              })
              .map(r => ({ value: r._raw[col], label: r._raw[col], _raw: r._raw }));
          }
          return [];
        }
        return unique[col].map(v => ({ value: v, label: v }));
      }
    }
    if (!field.parent_field || !field.source_config) return field.options || [];
    const parentVal = getParentValue(field.parent_field);
    if (!parentVal) return [];
    try {
      const sc = typeof field.source_config === 'string' ? JSON.parse(field.source_config) : field.source_config;
      if (sc[parentVal]) {
        return (field.options || []).filter(o => sc[parentVal].includes(o.value || o));
      }
      return field.options || [];
    } catch { return field.options || []; }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      const service = updateService || ENTITY_SERVICES[entity];
      if (!service) {
        setError('Entity không hỗ trợ cập nhật');
        setSaving(false);
        return;
      }
      const fixedKeys = ['id', 'created_at', 'updated_at', 'password'];
      const jsonFields = allFields.filter(f => f.source_type === 'json');
      const customData = {};
      jsonFields.forEach(f => {
        if (formData[f.key] !== undefined) {
          customData[f.key] = formData[f.key];
        }
      });
      const payload = { ...formData, custom_data: Object.keys(customData).length > 0 ? customData : undefined };
      fixedKeys.forEach(k => { delete payload[k]; });
      const res = await service.update(record.id, payload, token);
      if (res.success) {
        setToast({ message: 'Cập nhật thành công', type: 'success' });
        setRecord({ ...record, ...formData, ...res.data });
        setMode('view');
        notifyBellRefresh();
        if (onSaved) onSaved();
      } else {
        setError(res.message || 'Lỗi cập nhật');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const handleSwitchMode = (newMode) => {
    setMode(newMode);
    if (newMode === 'edit') initFormData([...viewFields, ...otherFields], record);
    if (onSwitchMode) onSwitchMode(newMode);
  };

  const viewFieldKeys = viewFields.map(f => f.field_key || f.key);
  const mainFields = viewFields.filter(f => f.visible);
  const otherFields = allFields.filter(f => !viewFieldKeys.includes(f.key));

  const getLayoutSections = () => {
    if (!formConfig?.layout_config?.sections) return null;
    const lc = formConfig.layout_config;
    const fieldsForm = formConfig.fields || [];
    const fieldsAll = [...viewFields, ...otherFields];
    const fieldsByKey = {};
    fieldsAll.forEach(f => { fieldsByKey[f.field_key || f.key] = f; });
    const cellMap = {};
    fieldsForm.forEach(f => {
      const cfg = f.config ? (typeof f.config === 'string' ? (() => { try { return JSON.parse(f.config); } catch { return null; } })() : f.config) : null;
      if (cfg && cfg.rowId != null && cfg.colIndex != null) {
        cellMap[`${cfg.rowId}-${cfg.colIndex}`] = fieldsByKey[f.key || f.field_key] || null;
      }
    });
    return lc.sections.filter(sec => {
      if (sec.visibleWhen) {
        const recData = record || formData;
        const val = getFieldValue(recData, { key: sec.visibleWhen.field });
        if (val !== sec.visibleWhen.value) return false;
      }
      return true;
    }).map(sec => ({
      ...sec,
      rows: (sec.rows || []).map(row => {
        const cols = parseInt((row.columns || '1:1').split(':')[1]);
        return {
          ...row,
          cells: Array.from({ length: cols }).map((_, ci) => cellMap[`${row.id}-${ci}`] || null)
        };
      })
    }));
  };

  const sections = getLayoutSections();

  if (loading) return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="legacy-modal legacy-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="loading">Đang tải...</div>
      </div>
    </div>
  );

  if (!record) return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="legacy-modal legacy-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="empty-state">{error || 'Không tìm thấy bản ghi'}</div>
        <div className="popup-footer">
          <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
        </div>
      </div>
    </div>
  );

  const mapLat = parseFloat(record.latitude);
  const mapLng = parseFloat(record.longitude);
  const hasCoords = !Number.isNaN(mapLat) && !Number.isNaN(mapLng);

  const renderFieldSection = (fields, sectionLabel) => (
    <div className="popup-section">
      <h3 className="popup-section-title">{sectionLabel}</h3>
      <div className="popup-fields">
        {fields.map(field => {
          const key = field.field_key || field.key;
          const label = field.field_label || field.label;
          const value = mode === 'edit' ? formData[key] : getFieldValue(record, { key });
          return (
            <div key={key} className="popup-field-row">
              <span className="popup-field-label">{label}</span>
              <span className="popup-field-value">
                {mode === 'edit' ? (
                  <DynamicField
                    field={{ ...field, options: resolveFieldOptions(field) }}
                    value={value}
                    onChange={(val) => handleFieldChange(key, val)}
                    entityId={record.id}
                    entityType={entity}
                    allFields={allFields}
                    dataListOptions={dataListOptions}
                  />
                ) : (
                  <FieldRenderer field={field} value={value} entity={entity} entityId={record.id} dataListOptions={dataListOptions} />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div className="legacy-modal legacy-modal-lg popup-detail" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <h2>{ENTITY_LABELS[entity] || entity} #{record.id} {mode === 'edit' && '(chỉnh sửa)'}</h2>
          <div className="flex items-center gap-2">
            {hasCoords && (
              <button className="btn btn-sm btn-outline btn-primary gap-1" onClick={() => setShowMap(true)}>
                <MapPinned size={14} />
                Xem bản đồ
              </button>
            )}
            <button className="btn-close" onClick={handleClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {entity === 'station_proposals' && record?.status === 'REJECTED' && record?.reject_reason && (
          <div className="alert alert-error mb-3">
            <span className="text-sm"><strong>Đề xuất bị từ chối:</strong> {record.reject_reason}</span>
          </div>
        )}

        <div className="popup-body">
          {sections && sections.length > 0 ? (
            sections.map(sec => (
              <fieldset key={sec.id} className="form-section" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                {sec.title && <legend style={{ fontWeight: 600, fontSize: 14, padding: '0 8px', color: '#374151' }}>{sec.title}</legend>}
                {sec.rows.map(row => (
                  <div key={row.id} className="form-row" data-cols={row.columns} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    {row.cells.map((field, ci) => (
                      <div key={ci} className="form-cell-content" style={{ flex: 1 }}>
                        {field ? (() => {
                          const key = field.field_key || field.key;
                          const label = field.field_label || field.label;
                          const value = mode === 'edit' ? formData[key] : getFieldValue(record, { key });
                          return (
                            <div className="dynamic-form-field">
                              <label style={{ fontWeight: 500, fontSize: 13, color: '#374151', marginBottom: 4, display: 'block' }}>{label}</label>
                              {mode === 'edit' ? (
                                <DynamicField
                                  field={{ ...field, options: resolveFieldOptions(field) }}
                                  value={value}
                                  onChange={(val) => handleFieldChange(key, val)}
                                  entityId={record.id}
                                  entityType={entity}
                                  allFields={allFields}
                                  dataListOptions={dataListOptions}
                                />
                              ) : (
                                <FieldRenderer field={field} value={value} entity={entity} entityId={record.id} dataListOptions={dataListOptions} />
                              )}
                            </div>
                          );
                        })() : <div className="form-cell-empty" />}
                      </div>
                    ))}
                  </div>
                ))}
              </fieldset>
            ))
          ) : (
            <>
              {mainFields.length > 0 && renderFieldSection(mainFields, 'Thông tin chính')}
              {otherFields.length > 0 && renderFieldSection(otherFields, 'Thông tin khác')}
            </>
          )}
          {entity === 'users' && record?.id && <UserExternalPanel userId={record.id} />}
        </div>

        <div className="popup-footer">
          {mode === 'view' ? (
            <>
              {allowEdit && <button className="btn btn-primary" onClick={() => handleSwitchMode('edit')}>Sửa</button>}
              <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => handleSwitchMode('view')}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : (entity === 'station_proposals' && record?.status === 'REJECTED' ? 'Gửi lại' : 'Lưu')}
              </button>
              <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
            </>
          )}
        </div>
      </div>

      {showMap && hasCoords && (
        <LocationMapModal
          open
          lat={record.latitude}
          lng={record.longitude}
          title={`${ENTITY_LABELS[entity] || entity} #${record.id}`}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
};

export default RecordDetailPopup;
