import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldDefinitionService, formService, formFieldService } from '../../services/api';
import Toast from '../Toast';
import ErrorMessage from '../ErrorMessage';
import DragDropList from './DragDropList';

const ENTITIES = ['stations', 'station_proposals', 'users'];

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
        await loadAvailableFields(formRes.data.entity);
        const fieldsRes = await formFieldService.getByForm(formId);
        if (fieldsRes.success) {
          setAssignedFields(fieldsRes.data.map(f => ({
            id: f.id,
            fieldId: f.field_id,
            label: f.field_label || f.label,
            key: f.field_key || f.key,
            type: f.field_type || f.type,
            orderIndex: f.order_index,
            visible: !!f.visible,
            colSpan: f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config).colSpan || 1 : 1,
            config: f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) : {}
          })));
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
      colSpan: 1,
      config: {}
    }]);
  };

  const handleRemoveField = (item) => {
    setAssignedFields(assignedFields.filter(f => f.fieldId !== item.fieldId));
  };

  const handleReorder = (newItems) => {
    setAssignedFields(newItems.map((item, idx) => ({ ...item, orderIndex: idx })));
  };

  const handleFieldConfigChange = (fieldId, key, value) => {
    setAssignedFields(assignedFields.map(f =>
      f.fieldId === fieldId ? { ...f, [key]: value } : f
    ));
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
        res = await formService.update(formId, { name: formName, description: formDesc }, token);
      } else {
        res = await formService.create({ entity, name: formName, description: formDesc }, token);
      }
      if (!res.success) {
        setError(res.message || 'Lỗi lưu form');
        setSaving(false);
        return;
      }
      const savedFormId = formId || res.data.id;
      for (const field of assignedFields) {
        if (field.id) {
          await formFieldService.update(savedFormId, field.id, {
            order_index: field.orderIndex,
            visible: field.visible ? 1 : 0,
            config: { colSpan: field.colSpan, ...field.config }
          }, token);
        } else {
          await formFieldService.add(savedFormId, {
            field_id: field.fieldId,
            order_index: field.orderIndex,
            visible: field.visible ? 1 : 0,
            config: { colSpan: field.colSpan, ...field.config }
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

      <div className="builder-layout">
        <div className="builder-panel">
          <div className="builder-panel-header">Available Fields ({filteredAvailable.length})</div>
          <div className="builder-panel-body">
            {filteredAvailable.length === 0 ? (
              <div className="builder-empty">Không có field nào khả dụng</div>
            ) : filteredAvailable.map(field => (
              <div key={field.id} className="builder-available-item" onClick={() => handleAddField(field)}>
                <div>
                  <strong>{field.label}</strong>
                  <div style={{ fontSize: 12, color: '#888' }}>{field.key} · {field.type}</div>
                </div>
                <span style={{ color: '#4a6cf7', fontSize: 20 }}>+</span>
              </div>
            ))}
          </div>
        </div>

        <div className="builder-panel">
          <div className="builder-panel-header">Form Fields ({assignedFields.length})</div>
          <div className="builder-panel-body">
            {assignedFields.length === 0 ? (
              <div className="builder-empty">Kéo fields từ panel bên trái vào đây</div>
            ) : (
              <DragDropList
                items={assignedFields}
                onReorder={handleReorder}
                onRemove={handleRemoveField}
                renderItem={(item) => (
                  <div className="builder-assigned-item">
                    <span className="drag-handle">⠿</span>
                    <div className="field-label">{item.label} <code style={{ fontSize: 11, color: '#888' }}>{item.key}</code></div>
                    <div className="field-config">
                      <label>
                        <input type="checkbox" checked={item.visible} onChange={(e) => handleFieldConfigChange(item.fieldId, 'visible', e.target.checked)} />
                        Hiển thị
                      </label>
                      <label>
                        Col:
                        <input type="number" min="1" max="4" value={item.colSpan} onChange={(e) => handleFieldConfigChange(item.fieldId, 'colSpan', parseInt(e.target.value) || 1)} />
                      </label>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        </div>
      </div>

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
