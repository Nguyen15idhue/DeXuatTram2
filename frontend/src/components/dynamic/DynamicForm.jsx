import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dynamicService, dataListService } from '../../services/api';
import DynamicField from './DynamicField';
import { create, all } from 'mathjs';
import { formatNumber } from '../../utils/formatNumber';

const math = create(all);
const customFunctions = {
  ROUNDUP: (x, d = 0) => Math.ceil(x * Math.pow(10, d)) / Math.pow(10, d),
  ROUNDDOWN: (x, d = 0) => Math.floor(x * Math.pow(10, d)) / Math.pow(10, d),
  MOD: (a, b) => a % b,
  IF: (condition, trueVal, falseVal) => condition ? trueVal : falseVal,
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (x) => !x,
  IFERROR: (val, fallback) => (val === null || val === undefined || isNaN(val) || val === Infinity) ? fallback : val,
  COUNT: (...args) => args.filter(v => v !== null && v !== undefined && !isNaN(v)).length,
  COUNTA: (...args) => args.filter(v => v !== null && v !== undefined && v !== '').length,
  AVERAGE: (...args) => { const nums = args.flat().filter(v => v !== null && v !== undefined && !isNaN(v)); return nums.length === 0 ? 0 : nums.reduce((s, v) => s + Number(v), 0) / nums.length; },
  CONCAT: (...args) => args.map(v => v ?? '').join(''),
  LEN: (s) => String(s ?? '').length,
  LEFT: (s, n = 1) => String(s ?? '').substring(0, n),
  RIGHT: (s, n = 1) => { const str = String(s ?? ''); return str.substring(str.length - n); },
  UPPER: (s) => String(s ?? '').toUpperCase(),
  LOWER: (s) => String(s ?? '').toLowerCase(),
  TRIM: (s) => String(s ?? '').trim(),
  LPAD: (s, len, ch = '0') => String(s ?? '').padStart(len, ch),
  RPAD: (s, len, ch = ' ') => String(s ?? '').padEnd(len, ch),
  YEAR: (d) => new Date(d).getFullYear(),
  MONTH: (d) => new Date(d).getMonth() + 1,
  DAY: (d) => new Date(d).getDate(),
  TODAY: () => new Date().toISOString().split('T')[0],
  NOW: () => new Date().toISOString(),
  DATE: (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
};
math.import(customFunctions, { override: false });

const DynamicForm = ({ entity, formId, onSubmit, initialData = {}, children }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formConfig, setFormConfig] = useState(null);
  const [fields, setFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [dataListOptions, setDataListOptions] = useState({});

  useEffect(() => {
    if (formId) loadFormConfig();
  }, [entity, formId]);

  const loadFormConfig = async () => {
    try {
      setLoading(true);
      const res = await dynamicService.getFormConfig(entity, formId);
      if (res.success) {
        setFormConfig(res.data.form);
        const fieldList = (res.data.fields || []).map(f => {
          const cfg = f.config ? (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) : {};
          return {
            ...f,
            config: cfg,
            conditions: cfg.conditions || [],
            conditionLogic: cfg.conditionLogic || 'AND',
            readonly: cfg.readonly || false,
            labelOverride: cfg.labelOverride || '',
            placeholderOverride: cfg.placeholderOverride || '',
            requiredOverride: cfg.requiredOverride
          };
        });
        setFields(fieldList);
        const defaults = {};
        fieldList.forEach(f => {
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

        const dlIds = [...new Set(fieldList.filter(f => f.data_list_id).map(f => f.data_list_id))];
        if (dlIds.length > 0) {
          const dlMap = {};
          await Promise.all(dlIds.map(async (dlId) => {
            try {
              const dlRes = await dataListService.getById(dlId, token);
              if (dlRes.success && dlRes.data) {
                const cols = dlRes.data.columns_config || [];
                const rows = dlRes.data.rows || [];
                const tree = {};
                const unique = {};
                cols.forEach(col => { tree[col.key] = {}; unique[col.key] = []; });
                rows.forEach(r => {
                  const data = r.data || {};
                  cols.forEach(col => {
                    const val = data[col.key];
                    if (!val) return;
                    if (!tree[col.key][val]) tree[col.key][val] = [];
                    const firstCol = cols[0];
                    tree[col.key][val].push({
                      value: firstCol ? (data[firstCol.key] || '') : '',
                      label: firstCol ? (data[firstCol.key] || '') : '',
                      _raw: data
                    });
                    if (!unique[col.key].includes(val)) unique[col.key].push(val);
                  });
                });
                dlMap[dlId] = { tree, unique };
              }
            } catch (err) { console.error('[DynamicForm] Error loading data list', dlId, err); }
          }));
          setDataListOptions(dlMap);
        }
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

  const getParentValue = useCallback((parentCol) => {
    if (formData[parentCol] !== undefined) return formData[parentCol];
    const parentFieldDef = fields.find(f => f.data_list_column === parentCol && f.key !== parentCol);
    if (parentFieldDef) return formData[parentFieldDef.key];
    return undefined;
  }, [fields, formData]);

  const prevFormDataRef = useRef(formData);

  useEffect(() => {
    let changed = false;
    const next = { ...formData };

    Object.keys(parentFieldMap).forEach(parentKey => {
      const childKeys = parentFieldMap[parentKey];
      childKeys.forEach(childKey => {
        const childField = fields.find(f => f.key === childKey);
        if (childField && childField.type === 'select') {
          const parentVal = getParentValue(parentKey);
          if (parentVal) {
            if (next[childKey] && !isOptionValidForParent(childField, parentVal, next[childKey])) {
              next[childKey] = '';
              changed = true;
            }
          }
        }
      });
    });

    fields.forEach(f => {
      if (f.type === 'formula' && f.key) {
        const val = computeFormula(f);
        if (next[f.key] !== val) {
          next[f.key] = val;
          changed = true;
        }
      }
    });

    if (changed) {
      setFormData(next);
    }
    prevFormDataRef.current = next;
  }, [formData, parentFieldMap, fields]);

  const isOptionValidForParent = (childField, parentVal, optionVal) => {
    if (!childField.data_list_id) return true;
    const { tree } = dataListOptions[childField.data_list_id] || {};
    if (!tree) return true;
    const col = childField.data_list_column;
    if (!col) return true;
    const parentCol = childField.parent_field;
    if (parentCol && tree[parentCol] && tree[parentCol][parentVal]) {
      return tree[parentCol][parentVal].some(r => r._raw?.[col] === optionVal);
    }
    return true;
  };

  const getFilteredOptions = (field) => {
    if (field.data_list_id && dataListOptions[field.data_list_id]) {
      const { tree, unique } = dataListOptions[field.data_list_id];
      const col = field.data_list_column;
      if (!col || !tree[col]) return [];

      if (field.parent_field) {
        const parentVal = getParentValue(field.parent_field);
        if (!parentVal) return [];
        const parentCol = field.parent_field;
        if (parentCol && tree[parentCol] && tree[parentCol][parentVal]) {
          const parentRows = tree[parentCol][parentVal];
          const seen = new Set();
          return parentRows.filter(r => {
            const v = r._raw?.[col];
            if (v && !seen.has(v)) { seen.add(v); return true; }
            return false;
          }).map(r => ({ value: r._raw[col], label: r._raw[col], _raw: r._raw }));
        }
        return [];
      }

      return (unique[col] || []).map(v => ({ value: v, label: v }));
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

  const computeFormula = (field) => {
    if (!field.formula_config || !field.formula_config.expression) return '';
    if (field.formula_config.compute_mode === 'post') return '';
    try {
      const scope = {};
      fields.forEach(f => {
        if (f.key !== field.key) {
          const val = formData[f.key];
          if (val !== undefined && val !== '') {
            scope[f.key] = f.type === 'number' ? (parseFloat(val) || 0) : val;
          }
        }
      });
      const result = math.evaluate(field.formula_config.expression, scope);
      if (result === null || result === undefined) return '';
      const outputType = field.formula_config.outputType || 'auto';
      if (outputType === 'number' || (outputType === 'auto' && typeof result === 'number')) {
        return formatNumber(result, {
          format: field.formula_config.numberFormat || 'plain',
          decimalPlaces: field.formula_config.decimalPlaces,
          unit: field.formula_config.unit
        });
      }
      return String(result);
    } catch { return ''; }
  };

  const isFieldVisible = useCallback((field) => {
    if (!field.conditions || field.conditions.length === 0) return true;
    const results = field.conditions.map(cond => {
      if (!cond.field || cond.field === '') return true;
      const val = formData[cond.field];
      const checkVal = cond.value || '';
      switch (cond.operator) {
        case '=': return String(val || '') === checkVal;
        case '!=': return String(val || '') !== checkVal;
        case 'contains': return String(val || '').toLowerCase().includes(checkVal.toLowerCase());
        case '>': return Number(val) > Number(checkVal);
        case '<': return Number(val) < Number(checkVal);
        case 'empty': return val === '' || val === null || val === undefined;
        case 'not_empty': return val !== '' && val !== null && val !== undefined;
        default: return true;
      }
    });
    return field.conditionLogic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }, [formData]);

  const validate = () => {
    const newErrors = {};
    fields.forEach(f => {
      if (!isFieldVisible(f)) return;
      const isRequired = f.requiredOverride !== undefined ? f.requiredOverride : f.required;
      if (isRequired) {
        const val = formData[f.key];
        if (val === '' || val === null || val === undefined) {
          const label = f.labelOverride || f.label;
          newErrors[f.key] = `${label} là bắt buộc`;
        }
        if (f.type === 'multiselect' && Array.isArray(val) && val.length === 0) {
          const label = f.labelOverride || f.label;
          newErrors[f.key] = `${label} là bắt buộc`;
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

  if (error && !formConfig) return <div className="error-message">{error}</div>;
  if (!formConfig) return <div className="empty-state">{loading ? 'Đang tải form...' : 'Không tìm thấy form'}</div>;

  const renderField = (field) => {
    const resolvedOptions = getFilteredOptions(field);
    const displayLabel = field.labelOverride || field.label;
    const displayPlaceholder = field.placeholderOverride || '';
    const isRequired = field.requiredOverride !== undefined ? field.requiredOverride : field.required;

    const fieldForRender = {
      ...field,
      label: displayLabel,
      placeholder: displayPlaceholder,
      required: isRequired,
      options: resolvedOptions,
      readonly: field.readonly || false
    };

    if (field.type === 'formula') {
      const isPost = field.formula_config?.compute_mode === 'post';
      return (
        <input
          type="text"
          className="form-control"
          value={formData[field.key] || ''}
          readOnly
          disabled
          placeholder={isPost ? 'Tính sau khi lưu' : 'Tính tự động'}
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

  const layoutConfig = formConfig?.layout_config
    ? (typeof formConfig.layout_config === 'string' ? JSON.parse(formConfig.layout_config) : formConfig.layout_config)
    : null;
  const hasLayout = layoutConfig && layoutConfig.rows && layoutConfig.rows.length > 0;

  const fieldsByKey = {};
  fields.forEach(f => { fieldsByKey[f.key] = f; });
  const fieldsById = {};
  fields.forEach(f => { fieldsById[f.id || f.fieldId] = f; });

  const fieldInCell = {};
  fields.forEach(f => {
    if (f.config?.rowId) {
      fieldInCell[`${f.config.rowId}-${f.config.colIndex}`] = f;
    }
  });

  const getCellField = (rowId, colIndex) => {
    return fieldInCell[`${rowId}-${colIndex}`] || null;
  };

  const renderLayoutForm = () => {
    return (
      <>
        {layoutConfig.rows.map((row) => {
          const desktopCol = parseInt(row.columns.split(':')[1]);
          return (
            <div key={row.id} className={`form-row form-row-${row.columns}`} data-cols={row.columns}>
              {Array.from({ length: desktopCol }).map((_, colIdx) => {
                const cellField = getCellField(row.id, colIdx);
                if (!cellField || !isFieldVisible(cellField)) {
                  return <div key={colIdx} className="form-cell-empty" />;
                }
                return (
                  <div key={colIdx} className="form-cell-content">
                    <div className="dynamic-form-field">
                      <label>
                        {cellField.labelOverride || cellField.label}
                        {(cellField.requiredOverride !== undefined ? cellField.requiredOverride : cellField.required) && <span style={{ color: '#dc2626' }}> *</span>}
                      </label>
                      {renderField(cellField)}
                      {cellField.help_text && <div className="field-help">{cellField.help_text}</div>}
                      {errors[cellField.key] && <div className="field-error">{errors[cellField.key]}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {fields.filter(f => !f.config?.rowId && isFieldVisible(f)).length > 0 && (
          <div className="dynamic-form-row">
            {fields.filter(f => !f.config?.rowId && isFieldVisible(f)).map(field => {
              const colSpan = field.config?.colSpan || 1;
              return (
                <div key={field.id || field.key} className={`dynamic-form-field ${colSpan > 1 ? 'full-width' : ''}`} style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}>
                  <label>
                    {field.labelOverride || field.label}
                    {(field.requiredOverride !== undefined ? field.requiredOverride : field.required) && <span style={{ color: '#dc2626' }}> *</span>}
                  </label>
                  {renderField(field)}
                  {field.help_text && <div className="field-help">{field.help_text}</div>}
                  {errors[field.key] && <div className="field-error">{errors[field.key]}</div>}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderFlatForm = () => {
    return (
      <div className="dynamic-form-row">
        {fields.filter(f => isFieldVisible(f)).map(field => {
          const colSpan = field.config?.colSpan || 1;
          return (
            <div key={field.id || field.key} className={`dynamic-form-field ${colSpan > 1 ? 'full-width' : ''}`} style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}>
              <label>
                {field.labelOverride || field.label}
                {(field.requiredOverride !== undefined ? field.requiredOverride : field.required) && <span style={{ color: '#dc2626' }}> *</span>}
              </label>
              {renderField(field)}
              {field.help_text && <div className="field-help">{field.help_text}</div>}
              {errors[field.key] && <div className="field-error">{errors[field.key]}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderNoLayoutMessage = () => {
    return (
      <div className="form-no-layout">
        <div className="form-no-layout-icon">⚙️</div>
        <h3>Chưa cấu hình layout</h3>
        <p>Vui lòng vào <strong>Admin → Forms</strong> để cấu hình layout cho form này.</p>
        <p>Sau khi cấu hình layout, form sẽ hiển thị các trường nhập liệu.</p>
      </div>
    );
  };

  return (
    <form className="dynamic-form" onSubmit={handleSubmit}>
      {error && <div className="error-message">{error}</div>}
      {hasLayout ? renderLayoutForm() : renderNoLayoutMessage()}
      {hasLayout && (
        children ? (
          <div className="form-actions">
            {children}
            <button type="submit" className="btn btn-primary">Lưu</button>
          </div>
        ) : (
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Lưu</button>
          </div>
        )
      )}
    </form>
  );
};

export default DynamicForm;
