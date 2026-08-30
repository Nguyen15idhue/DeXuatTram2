import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dynamicService } from '../../services/api';
import DynamicField from './DynamicField';
import FileUpload from './FileUpload';

const DynamicForm = ({ entity, formId, onSubmit, initialData = {}, children }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formConfig, setFormConfig] = useState(null);
  const [fields, setFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (formId) loadFormConfig();
  }, [entity, formId]);

  const loadFormConfig = async () => {
    try {
      setLoading(true);
      const res = await dynamicService.getFormConfig(entity, formId);
      if (res.success) {
        setFormConfig(res.data.form);
        setFields(res.data.fields || []);
        const defaults = {};
        (res.data.fields || []).forEach(f => {
          if (initialData[f.key] !== undefined) {
            defaults[f.key] = initialData[f.key];
          } else if (f.default_value !== undefined) {
            defaults[f.key] = f.default_value;
          } else if (f.type === 'boolean') {
            defaults[f.key] = false;
          } else if (f.type === 'multiselect') {
            defaults[f.key] = [];
          } else {
            defaults[f.key] = '';
          }
        });
        setFormData(defaults);
      }
    } catch {
      setError('Lỗi tải cấu hình form');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = useCallback((key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  }, []);

  const validate = () => {
    const newErrors = {};
    fields.forEach(f => {
      if (f.required) {
        const val = formData[f.key];
        if (val === '' || val === null || val === undefined) {
          newErrors[f.key] = `${f.label} là bắt buộc`;
        }
        if (f.type === 'multiselect' && Array.isArray(val) && val.length === 0) {
          newErrors[f.key] = `${f.label} là bắt buộc`;
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    try {
      if (onSubmit) {
        await onSubmit(formData);
      }
    } catch (err) {
      setError(err.message || 'Lỗi lưu dữ liệu');
    }
  };

  if (loading) return <div className="loading">Đang tải form...</div>;
  if (error && !formConfig) return <div className="error-message">{error}</div>;
  if (!formConfig) return <div className="empty-state">Không tìm thấy form</div>;

  return (
    <form className="dynamic-form" onSubmit={handleSubmit}>
      {error && <div className="error-message">{error}</div>}
      <div className="dynamic-form-row">
        {fields.map(field => {
          const colSpan = field.config?.colSpan || 1;
          return (
            <div key={field.id || field.key} className={`dynamic-form-field ${colSpan > 1 ? 'full-width' : ''}`} style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}>
              <label>
                {field.label}
                {field.required && <span style={{ color: '#dc2626' }}> *</span>}
              </label>
              {field.type === 'file' ? (
                <FileUpload
                  value={formData[field.key]}
                  onChange={(val) => handleChange(field.key, val)}
                  entityType={entity}
                  multiple={field.config?.multiple}
                />
              ) : (
                <DynamicField
                  field={field}
                  value={formData[field.key]}
                  onChange={(val) => handleChange(field.key, val)}
                  error={errors[field.key]}
                />
              )}
              {field.help_text && <div className="field-help">{field.help_text}</div>}
              {errors[field.key] && <div className="field-error">{errors[field.key]}</div>}
            </div>
          );
        })}
      </div>
      {children ? (
        <div className="form-actions">
          {children}
          <button type="submit" className="btn btn-primary">Lưu</button>
        </div>
      ) : (
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Lưu</button>
        </div>
      )}
    </form>
  );
};

export default DynamicForm;
