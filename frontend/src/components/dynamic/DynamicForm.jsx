import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dynamicService } from '../../services/api';
import DynamicField from './DynamicField';

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
          if (initialData[f.key] !== undefined && initialData[f.key] !== null) {
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

  const parentFieldMap = useMemo(() => {
    const map = {};
    fields.forEach(f => {
      if (f.parent_field) {
        if (!map[f.parent_field]) map[f.parent_field] = [];
        map[f.parent_field].push(f.key);
      }
    });
    return map;
  }, [fields]);

  useEffect(() => {
    Object.keys(parentFieldMap).forEach(parentKey => {
      const childKeys = parentFieldMap[parentKey];
      childKeys.forEach(childKey => {
        const childField = fields.find(f => f.key === childKey);
        if (childField && childField.type === 'select') {
          const parentVal = formData[parentKey];
          if (parentVal) {
            setFormData(prev => {
              if (prev[childKey] && !isOptionValidForParent(childField, parentVal, prev[childKey])) {
                return { ...prev, [childKey]: '' };
              }
              return prev;
            });
          }
        }
      });
    });
  }, [formData, parentFieldMap, fields]);

  const isOptionValidForParent = (childField, parentVal, optionVal) => {
    if (!childField.source_config) return true;
    try {
      const sc = typeof childField.source_config === 'string' ? JSON.parse(childField.source_config) : childField.source_config;
      if (sc[parentVal]) {
        return sc[parentVal].includes(optionVal);
      }
      return true;
    } catch { return true; }
  };

  const getFilteredOptions = (field) => {
    if (!field.parent_field || !field.source_config) return field.options || [];
    const parentVal = formData[field.parent_field];
    if (!parentVal) return [];
    try {
      const sc = typeof field.source_config === 'string' ? JSON.parse(field.source_config) : field.source_config;
      if (sc[parentVal]) {
        const allowed = sc[parentVal];
        return (field.options || []).filter(o => allowed.includes(o.value || o));
      }
      return field.options || [];
    } catch { return field.options || []; }
  };

  const computeFormula = (field) => {
    if (!field.formula_config || !field.formula_config.expression) return '';
    try {
      let expr = field.formula_config.expression;
      fields.forEach(f => {
        if (f.key !== field.key && f.type === 'number') {
          const val = parseFloat(formData[f.key]) || 0;
          expr = expr.replace(new RegExp(`\\b${f.key}\\b`, 'g'), val);
        }
      });
      const result = Function(`"use strict"; return (${expr})`)();
      if (typeof result === 'number' && !isNaN(result)) {
        const dp = field.decimal_places ?? 2;
        return result.toFixed(dp);
      }
      return '';
    } catch { return ''; }
  };

  useEffect(() => {
    fields.forEach(f => {
      if (f.type === 'formula' && f.key) {
        const val = computeFormula(f);
        setFormData(prev => {
          if (prev[f.key] !== val) {
            return { ...prev, [f.key]: val };
          }
          return prev;
        });
      }
    });
  }, [formData, fields]);

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

  const renderField = (field) => {
    const fieldForRender = field.parent_field ? { ...field, options: getFilteredOptions(field) } : field;

    if (field.type === 'formula') {
      return (
        <input
          type="text"
          className="form-control"
          value={formData[field.key] || ''}
          readOnly
          disabled
          placeholder="Tính tự động"
        />
      );
    }

    return (
      <DynamicField
        field={fieldForRender}
        value={formData[field.key]}
        onChange={(val) => handleChange(field.key, val)}
        error={errors[field.key]}
        entityType={entity}
      />
    );
  };

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
              {renderField(field)}
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
