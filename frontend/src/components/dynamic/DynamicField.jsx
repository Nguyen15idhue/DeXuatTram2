import { useState, useRef, useEffect } from 'react';
import FileUpload from './FileUpload';

const DynamicField = ({ field, value, onChange, error, disabled, entityId, entityType }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

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

  const optionStyle = (() => {
    if (!field.option_style) return { defaultColor: '#666666', defaultBorderRadius: 'rounded' };
    if (typeof field.option_style === 'object') return field.option_style;
    try { return JSON.parse(field.option_style); } catch { return { defaultColor: '#666666', defaultBorderRadius: 'rounded' }; }
  })();

  const fileConfig = (() => {
    if (!field.file_config) return { images: true, videos: false, documents: true, maxSize: 5, multiple: false };
    if (typeof field.file_config === 'object') return field.file_config;
    try { return JSON.parse(field.file_config); } catch { return { images: true, videos: false, documents: true, maxSize: 5, multiple: false }; }
  })();

  const buildAccept = () => {
    const parts = [];
    if (fileConfig.images) parts.push('image/*');
    if (fileConfig.videos) parts.push('video/*');
    if (fileConfig.documents) parts.push('application/pdf,.doc,.docx,.xls,.xlsx,.txt');
    return parts.join(',') || undefined;
  };

  const getBadgeStyle = (opt) => {
    const color = opt.color || optionStyle.defaultColor || '#666666';
    const radius = opt.borderRadius || optionStyle.defaultBorderRadius || 'rounded';
    const radiusMap = { square: '2px', 'rounded-sm': '4px', rounded: '8px', 'rounded-full': '9999px' };
    return {
      display: 'inline-block', padding: '2px 10px', fontSize: 12, fontWeight: 500,
      color: '#fff', backgroundColor: color, borderRadius: radiusMap[radius] || '8px', cursor: 'pointer'
    };
  };

  const handleChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    onChange(val);
  };

  const baseClass = `form-control ${error ? 'is-invalid' : ''}`;
  const step = field.type === 'number' ? (field.number_format === 'integer' ? '1' : (field.decimal_places > 0 ? '0.' + '0'.repeat(field.decimal_places - 1) + '1' : 'any')) : undefined;

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
          value={value ?? ''}
          onChange={handleChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          step={step || 'any'}
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

    case 'select': {
      const selectedOpt = parsedOptions.find(o => (o.value || o) === value);
      return (
        <div className="dynamic-field-select" style={{ position: 'relative' }} ref={dropdownRef}>
          <div
            className={baseClass}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}
            onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          >
            {value && selectedOpt ? (
              <span style={getBadgeStyle(selectedOpt)}>{selectedOpt.label || value}</span>
            ) : (
              <span style={{ color: '#999' }}>-- Chọn --</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 10 }}>▼</span>
          </div>
          {dropdownOpen && (
            <div className="dynamic-select-dropdown" style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: '#fff', border: '1px solid #d0d0d0', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflow: 'auto', padding: 4
            }}>
              <div
                style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, color: '#999' }}
                onClick={() => { onChange(''); setDropdownOpen(false); }}
              >
                -- Chọn --
              </div>
              {parsedOptions.map((opt, idx) => {
                const optVal = opt.value || opt;
                const optLabel = opt.label || opt;
                const isSelected = value === optVal;
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                      background: isSelected ? '#f0f0f0' : 'transparent'
                    }}
                    onClick={() => { onChange(optVal); setDropdownOpen(false); }}
                  >
                    <span style={getBadgeStyle(opt)}>{optLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    case 'multiselect': {
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div className="dynamic-field-multiselect" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {parsedOptions.map((opt, idx) => {
            const optVal = opt.value || opt;
            const optLabel = opt.label || opt;
            const isSelected = selectedValues.includes(optVal);
            return (
              <label key={idx} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    const current = [...selectedValues];
                    if (e.target.checked) {
                      current.push(optVal);
                    } else {
                      const i = current.indexOf(optVal);
                      if (i > -1) current.splice(i, 1);
                    }
                    onChange(current);
                  }}
                  disabled={disabled}
                  style={{ display: 'none' }}
                />
                <span style={{
                  ...getBadgeStyle(opt),
                  opacity: isSelected ? 1 : 0.5,
                  outline: isSelected ? `2px solid ${opt.color || optionStyle.defaultColor || '#666'}` : 'none'
                }}>
                  {isSelected ? '✓ ' : ''}{optLabel}
                </span>
              </label>
            );
          })}
          {parsedOptions.length === 0 && <span style={{ color: '#999', fontSize: 13 }}>Không có options</span>}
        </div>
      );
    }

    case 'file':
      return (
        <FileUpload
          value={value}
          onChange={onChange}
          entityId={entityId}
          entityType={entityType}
          multiple={fileConfig.multiple}
          accept={buildAccept()}
          disabled={disabled}
          fileConfig={fileConfig}
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
