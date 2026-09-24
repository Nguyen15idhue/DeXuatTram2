import { useState, useRef, useEffect } from 'react';
import FileUpload from './FileUpload';
import UserField from './UserField';
import { formatNumber, parseFormattedNumber, parseLeadingNumber } from '../../utils/formatNumber';
import { resolveColumnDatalist, getColumnSource } from '../../utils/tableColumnSource';
import { computeFooterValue, formatFooterValue, getFooterConfig, hasFooter } from '../../utils/tableFooter';
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

const parseTableConfig = (sc) => {
  if (!sc) return { columns: [], min_rows: 0, max_rows: 10 };
  if (typeof sc === 'object') return sc;
  try { return JSON.parse(sc); } catch { return { columns: [], min_rows: 0, max_rows: 10 }; }
};

const TABLE_LINK_OPS = ['=', '!=', 'contains', 'not_contains', 'in', 'empty', 'not_empty'];

const normalizeTableLink = (col) => {
  if (!col) return null;
  if (col.data_link && (col.data_link.enabled || (col.column_type === 'select' && getColumnSource(col, null) === 'datalist'))) {
    return {
      trigger: col.data_link.trigger_column || null,
      fallbackColumn: col.data_link.default_column || null,
      datalistId: col.data_link.datalist_id || col.data_list_id || null,
      conditions: Array.isArray(col.data_link.conditions) ? col.data_link.conditions : []
    };
  }
  if (col.autofill_from && (col.autofill_column || (col.price_rules && col.price_rules.when_field))) {
    const pr = col.price_rules || {};
    const conditions = pr.when_field
      ? Object.entries(pr.map || {}).map(([value, column]) => ({ field: pr.when_field, op: '=', value, column }))
      : [];
    return {
      trigger: col.autofill_from,
      fallbackColumn: col.autofill_column || null,
      datalistId: col.data_list_id || null,
      conditions
    };
  }
  return null;
};

const getTablePriceRule = (col) => normalizeTableLink(col);

const parseManualOptions = (options) => {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string') {
    try { const p = JSON.parse(options); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

const resolveCondFieldLabel = (fieldKey, rawVal, allFields, dataListOptions) => {
  const def = (allFields || []).find((f) => f && (f.key === fieldKey || f.field_key === fieldKey));
  if (!def) return null;
  const m = parseManualOptions(def.options).find((o) => String(o && o.value !== undefined ? o.value : (o && o.label)) === String(rawVal));
  if (m) return (m.label !== undefined && m.label !== null) ? String(m.label) : null;
  if (def.data_list_id && def.data_list_column && dataListOptions) {
    const map = dataListOptions[def.data_list_id];
    const bucket = map && map.tree && map.tree[def.data_list_column] ? map.tree[def.data_list_column][rawVal] : null;
    const r0 = bucket && bucket[0] ? bucket[0]._raw : null;
    if (r0) {
      const lc = def.data_list_label_column || def.data_list_column;
      if (r0[lc] !== undefined && r0[lc] !== null && r0[lc] !== '') return String(r0[lc]);
    }
  }
  return null;
};

const testTableCondition = (cond, formValues, labelOf) => {
  if (!cond || !cond.field || !TABLE_LINK_OPS.includes(cond.op)) return false;
  const raw = (formValues || {})[cond.field];
  const s = (v) => String(v === undefined || v === null ? '' : v);
  const cands = [s(raw)];
  try {
    const lb = labelOf(cond.field, raw);
    if (lb !== null && lb !== undefined && s(lb) !== s(raw)) cands.push(s(lb));
  } catch { /* silent */ }
  const t = s(cond.value);
  const tl = t.toLowerCase();
  switch (cond.op) {
    case '=': return cands.includes(t);
    case '!=': return !cands.includes(t);
    case 'contains': return tl !== '' && cands.some((c) => c.toLowerCase().includes(tl));
    case 'not_contains': return tl === '' || !cands.some((c) => c.toLowerCase().includes(tl));
    case 'in': {
      const set = t.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      return set.length > 0 && cands.some((c) => set.includes(c.toLowerCase()));
    }
    case 'empty': return raw === '' || raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0);
    case 'not_empty': return !(raw === '' || raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0));
    default: return false;
  }
};

const resolveTableCellRef = (col, allFields) => {
  const base = (() => {
    if (col.field_id) {
      const found = (allFields || []).find(f => f.id === col.field_id || f.field_id === col.field_id);
      if (found) return found;
    }
    return {
      type: col.column_type || 'text',
      key: col.key,
      options: (col.options || []).map(o => typeof o === 'object' ? o : { label: o, value: o })
    };
  })();
  const dl = resolveColumnDatalist(col, col.field_id ? base : null);
  return {
    ...base,
    type: col.column_type || base.type,
    data_list_id: dl ? dl.data_list_id : null,
    data_list_column: dl ? dl.data_list_column : null,
    data_list_label_column: dl ? dl.data_list_label_column : null,
    parent_column: col.parent_column || null
  };
};

const collectTablePriceOptions = ({ columns, col, row, formValues, dataListOptions, resolveCellField, allFields }) => {
  const link = normalizeTableLink(col);
  if (!link || !link.trigger) return null;
  const labelOf = (fk, rv) => resolveCondFieldLabel(fk, rv, allFields, dataListOptions);
  let priceCol = link.fallbackColumn;
  for (const cond of (link.conditions || [])) {
    if (testTableCondition(cond, formValues, labelOf)) { priceCol = cond.column; break; }
  }
  if (!priceCol) return null;
  const srcCol = (columns || []).find((c) => c && c.key === link.trigger);
  if (!srcCol) return null;
  const srcVal = row ? row[link.trigger] : '';
  if (srcVal === '' || srcVal === null || srcVal === undefined) return [];
  const ref = resolveCellField(srcCol);
  if (!ref || !ref.data_list_id || !ref.data_list_column) return null;
  const map = dataListOptions ? dataListOptions[ref.data_list_id] : null;
  if (!map || !map.tree || !map.tree[ref.data_list_column]) return null;
  const bucket = map.tree[ref.data_list_column][srcVal] || [];
  const seen = new Set();
  const opts = [];
  bucket.forEach((r2) => {
    const v = r2 && r2._raw ? r2._raw[priceCol] : undefined;
    if (v === null || v === undefined || v === '') return;
    const k = String(v);
    if (!seen.has(k)) { seen.add(k); opts.push(v); }
  });
  return opts;
};

const applyTablePriceRulesToRow = ({ columns, row, formValues, dataListOptions, resolveCellField, allFields }) => {
  let next = null;
  (columns || []).forEach((col) => {
    if (!normalizeTableLink(col)) return;
    const opts = collectTablePriceOptions({ columns, col, row: next || row, formValues, dataListOptions, resolveCellField, allFields });
    if (opts === null) return;
    const cur = (next || row)[col.key];
    if (!opts.some((v) => String(v) === String(cur))) {
      next = { ...(next || row), [col.key]: opts.length === 1 ? opts[0] : '' };
    }
  });
  return next;
};

const DynamicField = ({ field, value, onChange, error, disabled, entityId, entityType, uploadUrl = '/files/upload', allowedOptions = null, allFields = [], dataListOptions = {}, formValues = {} }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [focusedCell, setFocusedCell] = useState(null);
  const [selectSearch, setSelectSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

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

  useEffect(() => {
    if (!dropdownOpen) {
      setSelectSearch('');
      setHighlightIndex(0);
      return;
    }
    const t = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [dropdownOpen]);

  const tablePriceCondSig = (() => {
    if (field.type !== 'table') return '';
    const tc = parseTableConfig(field.source_config);
    return (tc.columns || []).filter((c) => normalizeTableLink(c)).map((c) => {
      const link = normalizeTableLink(c);
      const keys = [link.trigger, ...(link.conditions || []).map((x) => x.field)];
      return `${c.key}=${keys.map((k) => String((formValues || {})[k] ?? '')).join(',')}`;
    }).join('|');
  })();

  useEffect(() => {
    if (field.type !== 'table' || disabled || !tablePriceCondSig) return;
    const tc = parseTableConfig(field.source_config);
    const cols = tc.columns || [];
    const rows = Array.isArray(value) ? value : [];
    const refOf = (c) => resolveTableCellRef(c, allFields);
    let changed = false;
    const next = rows.map((row) => {
      const nr = applyTablePriceRulesToRow({ columns: cols, row, formValues, dataListOptions, resolveCellField: refOf, allFields });
      if (nr) { changed = true; return nr; }
      return row;
    });
    if (changed) onChange(next);
  }, [tablePriceCondSig, dataListOptions]);

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

  const normalizeForSearch = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

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

  const renderTableCell = (refField, cellVal, onChangeCell, disabledCell, cellOptions = null, cellId = null, col = null) => {
    const cellClass = 'form-control';
    const cellStyle = { padding: '2px 4px', fontSize: 13, border: 'none', width: '100%' };
    switch (refField.type) {
      case 'number': {
        const isFocused = focusedCell === cellId;
        const fmtOpts = { format: col?.display_format || 'plain', decimalPlaces: col?.decimal_places, unit: col?.unit };
        const shown = isFocused
          ? String(cellVal ?? '')
          : (cellVal === '' || cellVal === null || cellVal === undefined ? '' : formatNumber(cellVal, fmtOpts));
        return (
          <input
            type="text"
            inputMode="decimal"
            className={cellClass}
            value={shown}
            onFocus={() => setFocusedCell(cellId)}
            onBlur={() => {
              setFocusedCell(null);
              const parsed = parseFormattedNumber(String(cellVal ?? ''));
              onChangeCell(isNaN(parsed) ? '' : parsed);
            }}
            onChange={(e) => onChangeCell(e.target.value)}
            disabled={disabledCell}
            style={cellStyle}
          />
        );
      }
      case 'select': {
        const opts = cellOptions || resolveCellOptions(refField);
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
        const opts = cellOptions || resolveCellOptions(refField);
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
      const selectedOpt = parsedOptions.find(o => (o.value !== undefined ? o.value : o) === value);
      const searchTerm = normalizeForSearch(selectSearch.trim());
      const filteredOptions = searchTerm
        ? parsedOptions.filter((opt) => {
            const optVal = opt.value !== undefined ? opt.value : opt;
            const optLabel = opt.label !== undefined ? opt.label : optVal;
            return normalizeForSearch(optLabel).includes(searchTerm) || normalizeForSearch(optVal).includes(searchTerm);
          })
        : parsedOptions;
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
            <div className="dynamic-select-dropdown absolute top-full left-0 right-0 z-[100] bg-white border border-gray-300 rounded-md shadow-lg max-h-[240px] overflow-auto p-1">
              <input
                ref={searchInputRef}
                type="text"
                value={selectSearch}
                onChange={(e) => { setSelectSearch(e.target.value); setHighlightIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDropdownOpen(false);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIndex(i => Math.min(i + 1, filteredOptions.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIndex(i => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const opt = filteredOptions[highlightIndex];
                    if (opt) {
                      onChange(opt.value !== undefined ? opt.value : opt);
                      setDropdownOpen(false);
                    }
                  }
                }}
                placeholder="Tìm kiếm..."
                className="sticky top-0 z-10 w-full px-2 py-1.5 mb-1 text-[13px] bg-white border border-gray-200 rounded outline-none focus:border-blue-400"
              />
              <div
                className="px-2.5 py-1.5 cursor-pointer text-[13px] text-gray-400"
                onClick={() => { onChange(''); setDropdownOpen(false); }}
              >
                -- Chọn --
              </div>
              {filteredOptions.length === 0 ? (
                <div className="px-2.5 py-2 text-[13px] text-gray-400">Không có kết quả</div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const optVal = opt.value !== undefined ? opt.value : opt;
                  const optLabel = opt.label !== undefined ? opt.label : optVal;
                  const isSelected = value === optVal;
                  const isHighlighted = idx === highlightIndex;
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                        background: isSelected ? '#e5e7eb' : (isHighlighted ? '#f3f4f6' : 'transparent')
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      onClick={() => { onChange(optVal); setDropdownOpen(false); }}
                    >
                      <span style={getBadgeStyle(opt)}>{optLabel}</span>
                    </div>
                  );
                })
              )}
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
          invalid={!!error}
          validationError={error}
        />
      );

    case 'formula': {
      const displayValue = (() => {
        if (value === null || value === undefined || value === '') return '';
        const { num, unit } = parseLeadingNumber(value);
        if (!isNaN(num)) {
          return formatNumber(num, {
            format: field.formula_config?.numberFormat || field.formula_config?.outputFormat || 'plain',
            decimalPlaces: field.formula_config?.decimalPlaces,
            unit: field.formula_config?.unit || unit
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
      const tc = parseTableConfig(field.source_config);
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

      const resolveCellField = (col) => resolveTableCellRef(col, allFields);

      const getCellOptions = (col, row) => {
        const ref = resolveCellField(col);
        const dlId = ref.data_list_id;
        if (dlId && dataListOptions[dlId] && ref.data_list_column) {
          const { tree, unique } = dataListOptions[dlId];
          const valCol = ref.data_list_column;
          if (ref.parent_column) {
            const parentColDef = columns.find(c => c.key === ref.parent_column);
            const parentDlCol = parentColDef ? resolveCellField(parentColDef).data_list_column : null;
            const parentVal = row ? row[ref.parent_column] : '';
            if (!parentDlCol || !parentVal || !tree[parentDlCol] || !tree[parentDlCol][parentVal]) return [];
            const seen = new Set();
            return tree[parentDlCol][parentVal]
              .filter(r2 => { const v = r2._raw?.[valCol]; if (v && !seen.has(v)) { seen.add(v); return true; } return false; })
              .map(r2 => ({ value: r2._raw[valCol], label: r2._raw[valCol] }));
          }
          if (tree[valCol] && unique[valCol]) {
            return unique[valCol].map(v => ({ value: v, label: v }));
          }
        }
        return resolveCellOptions(ref);
      };

      const findDataListRaw = (col, val) => {
        const ref = resolveCellField(col);
        if (!ref.data_list_id || !ref.data_list_column) return null;
        const map = dataListOptions[ref.data_list_id];
        if (!map || !map.tree || !map.tree[ref.data_list_column]) return null;
        const bucket = map.tree[ref.data_list_column][val];
        return bucket && bucket[0] ? bucket[0]._raw : null;
      };

      const updateCell = (rowIdx, colKey, val) => {
        if (disabled) return;
        let updatedRow = { ...rows[rowIdx], [colKey]: val };

        columns.forEach(col => {
          if (col.parent_column === colKey) updatedRow[col.key] = '';
        });

        const changedCol = columns.find(c => c.key === colKey);
        if (changedCol) {
          columns.forEach(col => {
            if (col.autofill_from === colKey && col.autofill_column && !getTablePriceRule(col)) {
              const raw = findDataListRaw(changedCol, val);
              if (raw && raw[col.autofill_column] !== undefined && raw[col.autofill_column] !== null) {
                updatedRow[col.key] = raw[col.autofill_column];
              }
            }
          });
          const priced = applyTablePriceRulesToRow({ columns, row: updatedRow, formValues, dataListOptions, resolveCellField, allFields });
          if (priced) updatedRow = priced;
        }

        const recomputedRow = columns.reduce((r, col) => {
          if (col.formula) {
            r[col.key] = computeFormula(col.formula, r);
          }
          return r;
        }, updatedRow);
        const next = rows.map((r, i) => i === rowIdx ? recomputedRow : r);
        onChange(next);
      };

      return (
        <div className={`dynamic-field-table${error ? ' has-error' : ''}`} style={{ overflowX: 'auto', border: error ? '1px solid #dc2626' : undefined, borderRadius: error ? 6 : undefined, padding: error ? 4 : undefined }}>
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
                    const refField = resolveCellField(col);
                    const cellOptions = getCellOptions(col, row);
                    const cellDisabled = disabled || hasFormula;
                    const priceOpts = getTablePriceRule(col)
                      ? collectTablePriceOptions({ columns, col, row, formValues, dataListOptions, resolveCellField, allFields })
                      : null;
                    const priceValid = priceOpts !== null && priceOpts.some((v) => String(v) === String(cellVal));
                    return (
                      <td key={col.key} style={{ ...TABLE_CELL_STYLE, background: hasFormula ? '#f0fdf4' : undefined }}>
                        {priceOpts !== null ? (
                          <select
                            className="form-control"
                            value={priceValid ? cellVal : ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              updateCell(rowIdx, col.key, raw === '' ? '' : (raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw));
                            }}
                            disabled={cellDisabled || priceOpts.length <= 1}
                            title={priceOpts.length <= 1 ? 'Tự động theo điều kiện giá' : 'Chọn giá'}
                            style={{ padding: '2px 4px', fontSize: 13, border: 'none', width: '100%' }}
                          >
                            <option value="">--</option>
                            {priceOpts.map((v, i) => (
                              <option key={i} value={v}>{typeof v === 'number' ? v.toLocaleString() : v}</option>
                            ))}
                          </select>
                        ) : renderTableCell(refField, cellVal, (val) => updateCell(rowIdx, col.key, val), cellDisabled, cellOptions, `${rowIdx}:${col.key}`, col)}
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
            {hasFooter(columns) && rows.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...TABLE_HEADER_STYLE, textAlign: 'center', fontWeight: 700, background: '#f1f5f9' }}></td>
                  {columns.map(col => {
                    const cfg = getFooterConfig(col);
                    if (!cfg) {
                      return <td key={col.key} style={{ ...TABLE_HEADER_STYLE, background: '#f1f5f9' }}></td>;
                    }
                    const getCellValue = (c, r) => (c.formula ? computeFormula(c.formula, r) : r[c.key]);
                    const footerVal = computeFooterValue(col, columns, rows, getCellValue);
                    return (
                      <td key={col.key} style={{ ...TABLE_HEADER_STYLE, background: '#f1f5f9', fontWeight: 700, color: '#1e40af' }}>
                        {cfg.label && <span style={{ fontSize: 11, color: '#6b7280', marginRight: 4 }}>{cfg.label}:</span>}
                        {formatFooterValue(footerVal, col)}
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

    case 'user':
      return <UserField field={field} value={value} onChange={onChange} disabled={disabled} error={error} />;

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
