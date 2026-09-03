import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fieldDefinitionService, viewService, viewFieldService } from '../../services/api';
import Toast from '../Toast';
import ErrorMessage from '../ErrorMessage';
import DragDropList from './DragDropList';

const ENTITIES = ['stations', 'station_proposals', 'users'];

const ViewBuilder = ({ viewId, onSaved }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [entity, setEntity] = useState('stations');
  const [viewName, setViewName] = useState('');
  const [viewDesc, setViewDesc] = useState('');
  const [availableFields, setAvailableFields] = useState([]);
  const [assignedFields, setAssignedFields] = useState([]);

  useEffect(() => {
    if (viewId) loadViewConfig();
  }, [viewId]);

  const loadViewConfig = async () => {
    try {
      setLoading(true);
      const viewRes = await viewService.getById(viewId);
      if (viewRes.success) {
        setEntity(viewRes.data.entity);
        setViewName(viewRes.data.name);
        setViewDesc(viewRes.data.description || '');
        await loadAvailableFields(viewRes.data.entity);
        const fieldsRes = await viewFieldService.getByView(viewId);
        if (fieldsRes.success) {
          setAssignedFields(fieldsRes.data.map(f => ({
            id: f.id,
            fieldId: f.field_id,
            label: f.field_label || f.label,
            key: f.field_key || f.key,
            type: f.field_type || f.type,
            orderIndex: f.order_index,
            visible: !!f.visible,
            width: f.width || null,
            sortable: !!f.sortable,
            filterable: !!f.filterable,
            config: f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) : {}
          })));
        }
      }
    } catch {
      setError('Lỗi tải cấu hình view');
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
      width: null,
      sortable: true,
      filterable: false,
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
    if (!viewName.trim()) {
      setError('Vui lòng nhập tên view');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let res;
      if (viewId) {
        res = await viewService.update(viewId, { entity, name: viewName, description: viewDesc }, token);
      } else {
        res = await viewService.create({ entity, name: viewName, description: viewDesc }, token);
      }
      if (!res.success) {
        setError(res.message || 'Lỗi lưu view');
        setSaving(false);
        return;
      }
      const savedViewId = viewId || res.data.id;

      const existingFieldsRes = await viewFieldService.getByView(savedViewId);
      const existingIds = existingFieldsRes.success ? existingFieldsRes.data.map(f => f.id) : [];
      const keptIds = assignedFields.filter(f => f.id).map(f => f.id);
      for (const exId of existingIds) {
        if (!keptIds.includes(exId)) {
          await viewFieldService.remove(savedViewId, exId, token);
        }
      }

      for (const field of assignedFields) {
        if (field.id) {
          await viewFieldService.update(savedViewId, field.id, {
            order_index: field.orderIndex,
            visible: field.visible ? 1 : 0,
            width: field.width,
            sortable: field.sortable ? 1 : 0,
            filterable: field.filterable ? 1 : 0,
            config: field.config
          }, token);
        } else {
          await viewFieldService.add(savedViewId, {
            field_id: field.fieldId,
            order_index: field.orderIndex,
            visible: field.visible ? 1 : 0,
            width: field.width,
            sortable: field.sortable ? 1 : 0,
            filterable: field.filterable ? 1 : 0,
            config: field.config
          }, token);
        }
      }
      setToast({ message: 'Lưu view thành công', type: 'success' });
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
    <div className="view-builder">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      {error && <ErrorMessage message={error} />}

      <div className="mb-4">
        <div className="form-row">
          <div className="form-group">
            <label>Entity</label>
            <select value={entity} onChange={(e) => handleEntityChange(e.target.value)} disabled={!!viewId}>
              {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Tên view *</label>
            <input type="text" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="VD: Danh sách trạm" />
          </div>
        </div>
        <div className="form-group">
          <label>Mô tả</label>
          <input type="text" value={viewDesc} onChange={(e) => setViewDesc(e.target.value)} placeholder="Mô tả ngắn" />
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
                  <div className="text-xs text-gray-400">{field.key} · {field.type}</div>
                </div>
                <span className="text-indigo-500 text-xl">+</span>
              </div>
            ))}
          </div>
        </div>

        <div className="builder-panel">
          <div className="builder-panel-header">Table Columns ({assignedFields.length})</div>
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
                    <div className="field-label">{item.label} <code className="text-[11px] text-gray-400">{item.key}</code></div>
                    <div className="field-config">
                      <label>
                        <input type="checkbox" checked={item.visible} onChange={(e) => handleFieldConfigChange(item.fieldId, 'visible', e.target.checked)} />
                        Hiển thị
                      </label>
                      <label>
                        W:
                        <input type="number" min="50" step="10" value={item.width || ''} onChange={(e) => handleFieldConfigChange(item.fieldId, 'width', e.target.value ? parseInt(e.target.value) : null)} placeholder="auto" />
                      </label>
                      <label>
                        <input type="checkbox" checked={item.sortable} onChange={(e) => handleFieldConfigChange(item.fieldId, 'sortable', e.target.checked)} />
                        Sắp xếp
                      </label>
                      <label>
                        <input type="checkbox" checked={item.filterable} onChange={(e) => handleFieldConfigChange(item.fieldId, 'filterable', e.target.checked)} />
                        Lọc
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
          {saving ? 'Đang lưu...' : 'Lưu view'}
        </button>
      </div>
    </div>
  );
};

export default ViewBuilder;
