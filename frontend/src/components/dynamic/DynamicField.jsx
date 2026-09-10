import { useState, useRef, useEffect } from 'react';
import FileUpload from './FileUpload';
import { formatNumber } from '../../utils/formatNumber';
import { create, all } from 'mathjs';

const math = create(all);
const customFunctions = {
  ROUNDUP: (x, d = 0) => Math.ceil(x * Math.pow(10, d)) / Math.pow(10, d),
  ROUNDDOWN: (x, d = 0) => Math.floor(x * Math.pow(10, d)) / Math.pow(10, d),
  MOD: (a, b) => a % b,
  IF: (cond, t, f) => cond ? t : f,
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (v) => !v,
  IFERROR: (v, fallback) => { try { return v; } catch { return fallback; } },
  ROUND: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; },
  CONCAT: (...args) => args.join(''),
  LEN: (s) => String(s ?? '').length,
  UPPER: (s) => String(s ?? '').toUpperCase(),
  LOWER: (s) => String(s ?? '').toLowerCase(),
  TRIM: (s) => String(s ?? '').trim(),
  LPAD: (s, len, ch = '0') => String(s ?? '').padStart(len, ch),
  RPAD: (s, len, ch = ' ') => String(s ?? '').padEnd(len, ch),
};
math.import(customFunctions, { override: false });

const computeFormula = (expression, rowData) => {
  if (!expression) return '';
  try {
    const scope = {};
    Object.entries(rowData).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) {
        scope[k] = 0;
      } else {
        scope[k] = v;
      }
    });
    const result = math.evaluate(expression, scope);
    return result;
  } catch {
    return '#ERR';
  }
};

const TABLE_CELL_STYLE = { padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 13 };
const TABLE_HEADER_STYLE = { padding: '6px 8px', border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, background: '#f8fafc', textAlign: 'left' };

const DynamicField = ({ field, value, onChange, error, disabled, entityId, entityType, uploadUrl = '/files/upload', allowedOptions = null, allFields = [], dataListOptions = {} }) => {
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
    let opts = [];
    if (!field.options) return [];
    if (Array.isArray(field.options)) opts = field.options;
    else {
      try {
        const parsed = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
        opts = Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    if (Array.isArray(allowedOptions)) {
      opts = opts.filter(o => allowedOptions.includes(o.value !== undefined ? o.value : o));
    }
    return opts;
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

  const resolveCellOptions = (refField) => {
    if (refField.data_list_id && dataListOptions[refField.data_list_id]) {
      const { unique } = dataListOptions[refField.data_list_id];
      const col = refField.data_list_column;
      if (col && unique[col]) return unique[col].map(v => ({ value: v, label: v }));
    }
    if (refField.options) {
      if (Array.isArray(refField.options)) return refField.options;
      try { return JSON.parse(refField.options); } catch { return []; }
    }
    return [];
  };

  const renderTableCell = (refField, cellVal, onChangeCell, disabledCell) => {
    const cellClass = 'form-control';
    const cellStyle = { padding: '2px 4px', fontSize: 13, border: 'none', width: '100%' };
    switch (refField.type) {
      case 'number':
        return (
          <input
            type="number"
            className={cellClass}
            value={cellVal ?? ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            step={refField.number_format === 'integer' ? '1' : 'any'}
            style={cellStyle}
          />
        );
      case 'select': {
        const opts = resolveCellOptions(refField);
        return (
          <select
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          >
            <option value="">--</option>
            {opts.map((o, i) => {
              const optVal = typeof o === 'object' ? (o.value ?? o.label) : o;
              const optLabel = typeof o === 'object' ? (o.label || o.value) : o;
              return <option key={i} value={optVal}>{optLabel}</option>;
            })}
          </select>
        );
      }
      case 'multiselect': {
        const opts = resolveCellOptions(refField);
        const selected = Array.isArray(cellVal) ? cellVal : [];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {opts.map((o, i) => {
              const optVal = typeof o === 'object' ? (o.value ?? o.label) : o;
              const optLabel = typeof o === 'object' ? (o.label || o.value) : o;
              const isSelected = selected.includes(optVal);
              return (
                <label key={i} style={{ cursor: disabledCell ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const cur = [...selected];
                      if (e.target.checked) cur.push(optVal);
                      else { const idx = cur.indexOf(optVal); if (idx > -1) cur.splice(idx, 1); }
                      onChangeCell(cur);
                    }}
                    disabled={disabledCell}
                    className="hidden"
                  />
                  <span style={{ display: 'inline-block', padding: '1px 6px', fontSize: 11, borderRadius: 4, background: isSelected ? '#3b82f6' : '#e5e7eb', color: isSelected ? '#fff' : '#374151' }}>
                    {optLabel}
                  </span>
                </label>
              );
            })}
          </div>
        );
      }
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={!!cellVal}
            onChange={(e) => onChangeCell(e.target.checked)}
            disabled={disabledCell}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      case 'datetime':
        return (
          <input
            type="datetime-local"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      case 'email':
        return (
          <input
            type="email"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      case 'phone':
        return (
          <input
            type="tel"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      case 'url':
        return (
          <input
            type="url"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      case 'password':
        return (
          <input
            type="password"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      case 'formula':
        return (
          <input
            type="text"
            className={cellClass}
            value={cellVal || ''}
            readOnly
            disabled
            style={{ ...cellStyle, background: '#f0fdf4' }}
          />
        );
      case 'file':
        return <span style={{ fontSize: 12, color: '#6b7280' }}>{Array.isArray(cellVal) ? `${cellVal.length} file` : (cellVal ? '1 file' : '-')}</span>;
      case 'textarea':
        return (
          <input
            type="text"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      default:
        return (
          <input
            type="text"
            className={cellClass}
            value={cellVal || ''}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
    }
  };

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

    case 'password':
      return (
        <input
          type="password"
          autoComplete="new-password"
          className={baseClass}
          value={value || ''}
          onChange={handleChange}
          placeholder={field.placeholder || 'Để trống = giữ nguyên'}
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
        <div className="dynamic-field-select relative" ref={dropdownRef}>
          <div
            className={baseClass}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}
            onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          >
            {value && selectedOpt ? (
              <span style={getBadgeStyle(selectedOpt)}>{selectedOpt.label || value}</span>
            ) : (
              <span className="text-gray-400">-- Chọn --</span>
            )}
            <span className="ml-auto text-[10px]">▼</span>
          </div>
          {dropdownOpen && (
            <div className="dynamic-select-dropdown absolute top-full left-0 right-0 z-[100] bg-white border border-gray-300 rounded-md shadow-lg max-h-[200px] overflow-auto p-1">
              <div
                className="px-2.5 py-1.5 cursor-pointer text-[13px] text-gray-400"
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
        <div className="dynamic-field-multiselect flex flex-wrap gap-1.5">
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
                  className="hidden"
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
          {parsedOptions.length === 0 && <span className="text-gray-400 text-[13px]">Không có options</span>}
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
          uploadUrl={uploadUrl}
        />
      );

    case 'formula': {
      const displayValue = (() => {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'number' || !isNaN(Number(value))) {
          return formatNumber(Number(value), {
            format: field.formula_config?.numberFormat || 'plain',
            decimalPlaces: field.formula_config?.decimalPlaces,
            unit: field.formula_config?.unit
          });
        }
        return String(value);
      })();
      return (
        <input
          type="text"
          className={baseClass}
          value={displayValue}
          onChange={handleChange}
          placeholder={field.placeholder || 'Formula (tính tự động)'}
          disabled={true}
          readOnly
        />
      );
    }

    case 'table': {
      const tc = (() => {
        if (!field.source_config) return { columns: [], min_rows: 0, max_rows: 10 };
        if (typeof field.source_config === 'object') return field.source_config;
        try { return JSON.parse(field.source_config); } catch { return { columns: [], min_rows: 0, max_rows: 10 }; }
      })();
      const rows = Array.isArray(value) ? value : [];
      const columns = tc.columns || [];
      const minRows = tc.min_rows || 0;
      const maxRows = tc.max_rows || 10;

      const addRow = () => {
        if (disabled) return;
        if (rows.length >= maxRows) return;
        const newRow = {};
        columns.forEach(col => { newRow[col.key] = ''; });
        const computedRow = columns.reduce((r, col) => {
          if (col.formula) r[col.key] = computeFormula(col.formula, r);
          return r;
        }, newRow);
        onChange([...rows, computedRow]);
      };

      const removeRow = (idx) => {
        if (disabled) return;
        if (rows.length <= minRows) return;
        const next = rows.filter((_, i) => i !== idx);
        onChange(next);
      };

      const updateCell = (rowIdx, colKey, val) => {
        if (disabled) return;
        const updatedRow = { ...rows[rowIdx], [colKey]: val };
        const recomputedRow = columns.reduce((r, col) => {
          if (col.formula) {
            r[col.key] = computeFormula(col.formula, r);
          }
          return r;
        }, updatedRow);
        const next = rows.map((r, i) => i === rowIdx ? recomputedRow : r);
        onChange(next);
      };

      const getReferencedField = (col) => {
        if (col.field_id) {
          const found = allFields.find(f => f.id === col.field_id || f.field_id === col.field_id);
          if (found) return found;
        }
        if (col.column_type) {
          return {
            type: col.column_type,
            key: col.key,
            options: (col.options || []).map(o => typeof o === 'object' ? o : { label: o, value: o })
          };
        }
        return { type: 'text', key: col.key };
      };

      return (
        <div className="dynamic-field-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...TABLE_HEADER_STYLE, width: 40, textAlign: 'center' }}>STT</th>
                {columns.map(col => (
                  <th key={col.key} style={{ ...TABLE_HEADER_STYLE, width: col.width || undefined }}>
                    {col.label || col.key}
                    {col.required && <span className="text-red-600"> *</span>}
                  </th>
                ))}
                {!disabled && <th style={{ ...TABLE_HEADER_STYLE, width: 50 }}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} style={{ ...TABLE_CELL_STYLE, textAlign: 'center', color: '#999', padding: '12px' }}>
                    Chưa có dữ liệu. Nhấn "+ Thêm dòng" để bắt đầu.
                  </td>
                </tr>
              )}
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  <td style={{ ...TABLE_CELL_STYLE, textAlign: 'center', color: '#999' }}>{rowIdx + 1}</td>
                  {columns.map(col => {
                    const hasFormula = !!col.formula;
                    let cellVal;
                    if (hasFormula) {
                      cellVal = computeFormula(col.formula, row);
                    } else {
                      cellVal = row[col.key] ?? '';
                    }
                    const refField = getReferencedField(col);
                    const cellDisabled = disabled || hasFormula;
                    return (
                      <td key={col.key} style={{ ...TABLE_CELL_STYLE, background: hasFormula ? '#f0fdf4' : undefined }}>
                        {renderTableCell(refField, cellVal, (val) => updateCell(rowIdx, col.key, val), cellDisabled)}
                        {hasFormula && <input type="hidden" value={cellVal} />}
                      </td>
                    );
                  })}
                  {!disabled && (
                    <td style={{ ...TABLE_CELL_STYLE, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeRow(rowIdx)}
                        disabled={rows.length <= minRows}
                        style={{ background: 'none', border: 'none', color: rows.length <= minRows ? '#ccc' : '#ef4444', cursor: rows.length <= minRows ? 'not-allowed' : 'pointer', fontSize: 16 }}
                        title="Xóa dòng"
                      >×</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {columns.some(col => col.footer_formula) && rows.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...TABLE_HEADER_STYLE, textAlign: 'center', fontWeight: 700, background: '#f1f5f9' }}></td>
                  {columns.map(col => {
                    if (!col.footer_formula) {
                      return <td key={col.key} style={{ ...TABLE_HEADER_STYLE, background: '#f1f5f9' }}></td>;
                    }
                    const values = rows.map(r => {
                      const raw = col.formula ? computeFormula(col.formula, r) : r[col.key];
                      const n = parseFloat(raw);
                      return isNaN(n) ? null : n;
                    }).filter(v => v !== null);
                    const FOOTER_LABELS = { SUM: 'Tổng', AVG: 'TB', MIN: 'Min', MAX: 'Max', COUNT: 'Đếm' };
                    let footerVal = '';
                    switch (col.footer_formula) {
                      case 'SUM': footerVal = values.reduce((a, b) => a + b, 0); break;
                      case 'AVG': footerVal = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; break;
                      case 'MIN': footerVal = values.length ? Math.min(...values) : 0; break;
                      case 'MAX': footerVal = values.length ? Math.max(...values) : 0; break;
                      case 'COUNT': footerVal = values.length; break;
                    }
                    const label = FOOTER_LABELS[col.footer_formula] || col.footer_formula;
                    return (
                      <td key={col.key} style={{ ...TABLE_HEADER_STYLE, background: '#f1f5f9', fontWeight: 700, color: '#1e40af' }}>
                        <span style={{ fontSize: 11, color: '#6b7280', marginRight: 4 }}>{label}:</span>{typeof footerVal === 'number' ? footerVal.toLocaleString() : footerVal}
                      </td>
                    );
                  })}
                  {!disabled && <td style={{ ...TABLE_HEADER_STYLE, background: '#f1f5f9' }}></td>}
                </tr>
              </tfoot>
            )}
          </table>
          {!disabled && rows.length < maxRows && (
            <button
              type="button"
              onClick={addRow}
              className="btn btn-xs btn-secondary mt-1"
              style={{ fontSize: 12 }}
            >+ Thêm dòng</button>
          )}
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {rows.length}/{maxRows} dòng {minRows > 0 && `(tối thiểu ${minRows})`}
          </div>
        </div>
      );
    }

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
