import { useState, useEffect } from 'react';
import { dynamicService, stationService, adminUserService, adminProposalService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import FieldRenderer from '../dynamic/FieldRenderer';
import DynamicField from '../dynamic/DynamicField';
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

const RecordDetailPopup = ({ entity, recordId, viewId, mode: modeProp, record: recordProp, onClose, onSaved, onSwitchMode }) => {
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

  useEffect(() => {
    if (modeProp) setMode(modeProp);
  }, [modeProp]);

  useEffect(() => {
    if (!recordProp && recordId && entity) {
      loadRecord();
    } else if (recordProp) {
      setRecord(recordProp);
      loadViewConfig();
    }
  }, [entity, recordId, recordProp]);

  const loadRecord = async () => {
    try {
      setLoading(true);
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
        loadViewConfig();
      } else {
        setError('Không tìm thấy bản ghi');
      }
    } catch {
      setError('Lỗi tải bản ghi');
    } finally {
      setLoading(false);
    }
  };

  const loadViewConfig = async () => {
    try {
      const vId = viewId || DEFAULT_VIEW_IDS[entity];
      if (!vId) return;
      const res = await dynamicService.getViewConfig(entity, vId);
      if (res.success) {
        const vf = res.data.fields || [];
        const af = res.data.allFields || [];
        setViewFields(vf);
        setAllFields(af);
        initFormData(af);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const initFormData = (fields) => {
    const data = {};
    (fields || []).forEach(f => {
      const key = f.key;
      if (record) {
        data[key] = getFieldValue(record, { key });
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

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      const service = ENTITY_SERVICES[entity];
      if (!service) {
        setError('Entity không hỗ trợ cập nhật');
        setSaving(false);
        return;
      }
      const res = await service.update(record.id, formData, token);
      if (res.success) {
        setToast({ message: 'Cập nhật thành công', type: 'success' });
        setRecord({ ...record, ...formData });
        setMode('view');
        if (onSwitchMode) onSwitchMode('view');
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
    if (newMode === 'edit') initFormData([...viewFields, ...otherFields]);
    if (onSwitchMode) onSwitchMode(newMode);
  };

  const viewFieldKeys = viewFields.map(f => f.field_key || f.key);
  const mainFields = viewFields.filter(f => f.visible);
  const otherFields = allFields.filter(f => !viewFieldKeys.includes(f.key));

  if (loading) return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="loading">Đang tải...</div>
      </div>
    </div>
  );

  if (!record) return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="empty-state">{error || 'Không tìm thấy bản ghi'}</div>
        <div className="popup-footer">
          <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
        </div>
      </div>
    </div>
  );

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
                    field={{ ...field, type: field.field_type || field.type }}
                    value={value}
                    onChange={(val) => handleFieldChange(key, val)}
                  />
                ) : (
                  <FieldRenderer field={{ type: field.field_type || field.type, options: field.options }} value={value} />
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
      <div className="modal modal-lg popup-detail" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <h2>{ENTITY_LABELS[entity] || entity} #{record.id} {mode === 'edit' && '(chỉnh sửa)'}</h2>
          <button className="btn btn-sm btn-secondary" onClick={handleClose}>✕ Đóng</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="popup-body">
          {mainFields.length > 0 && renderFieldSection(mainFields, 'Thông tin chính')}
          {otherFields.length > 0 && renderFieldSection(otherFields, 'Thông tin khác')}
        </div>

        <div className="popup-footer">
          {mode === 'view' ? (
            <>
              <button className="btn btn-primary" onClick={() => handleSwitchMode('edit')}>Sửa</button>
              <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => handleSwitchMode('view')}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
              <button className="btn btn-secondary" onClick={handleClose}>Đóng</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordDetailPopup;
