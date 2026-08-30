import { useState } from 'react';

const DynamicField = ({ field, value, onChange, error, disabled }) => {
  const [options, setOptions] = useState([]);

  const parsedOptions = (() => {
    if (!field.options) return [];
    if (Array.isArray(field.options)) return field.options;
    try {
      const parsed = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const handleChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    onChange(val);
  };

  const baseClass = `form-control ${error ? 'is-invalid' : ''}`;

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          rows={3}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          step="any"
        />
      );

    case 'email':
      return (
        <input
          type="email"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
        />
      );

    case 'phone':
      return (
        <input
          type="tel"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
        />
      );

    case 'url':
      return (
        <input
          type="url"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          disabled={disabled}
        />
      );

    case 'datetime':
      return (
        <input
          type="datetime-local"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          disabled={disabled}
        />
      );

    case 'boolean':
      return (
        <label className="dynamic-field-checkbox">
          <input
            type="checkbox"
            checked={!!value}
            onChange={handleChange}
            disabled={disabled}
          />
          <span>{field.placeholder || 'Có'}</span>
        </label>
      );

    case 'select':
      return (
        <select className={baseClass} value={value || ''} onChange={handleChange} disabled={disabled}>
          <option value="">-- Chọn --</option>
          {parsedOptions.map((opt, idx) => (
            <option key={idx} value={opt.value || opt}>{opt.label || opt}</option>
          ))}
        </select>
      );

    case 'multiselect':
      return (
        <div className="dynamic-field-multiselect">
          {parsedOptions.map((opt, idx) => {
            const optVal = opt.value || opt;
            const optLabel = opt.label || opt;
            const checked = Array.isArray(value) && value.includes(optVal);
            return (
              <label key={idx} className="dynamic-field-checkbox">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? [...value] : [];
                    if (e.target.checked) {
                      current.push(optVal);
                    } else {
                      const i = current.indexOf(optVal);
                      if (i > -1) current.splice(i, 1);
                    }
                    onChange(current);
                  }}
                  disabled={disabled}
                />
                <span>{optLabel}</span>
              </label>
            );
          })}
        </div>
      );

    case 'file':
      return (
        <input
          type="file"
          className={`form-control-file ${error ? 'is-invalid' : ''}`}
          onChange={(e) => onChange(e.target.files)}
          disabled={disabled}
          multiple={field.config?.multiple || false}
        />
      );

    case 'formula':
      return (
        <input
          type="text"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || 'Formula (tính tự động)'}
          disabled={true}
          readOnly
        />
      );

    default:
      return (
        <input
          type="text"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
        />
      );
  }
};

export default DynamicField;
