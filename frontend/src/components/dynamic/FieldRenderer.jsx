import { useState, lazy, Suspense } from 'react';
import { create, all } from 'mathjs';
import { Zap } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { getDataListLabelFromMap } from '../../utils/dataListLabel';

const math = create(all);
const customFunctions = {
  ROUNDUP: (x, d = 0) => Math.ceil(x * Math.pow(10, d)) / Math.pow(10, d),
  ROUNDDOWN: (x, d = 0) => Math.floor(x * Math.pow(10, d)) / Math.pow(10, d),
  MOD: (a, b) => a % b,
  IF: (cond, t, f) => cond ? t : f,
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (v) => !v,
  ROUND: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; },
  CONCAT: (...args) => args.join(''),
  LEN: (s) => String(s ?? '').length,
  UPPER: (s) => String(s ?? '').toUpperCase(),
  LOWER: (s) => String(s ?? '').toLowerCase(),
  TRIM: (s) => String(s ?? '').trim(),
};
math.import(customFunctions, { override: false });

const FileListPopup = lazy(() => import('./FileListPopup'));

const getFileUrl = (file, entity, entityId) => {
  if (!file) return '';
  if (file.link) return file.link;
  if (file.id) {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    return `${base}/files/${file.id}/image`;
  }
  return '';
};

const FieldRenderer = ({ field, value, entity, entityId, dataListOptions = {} }) => {
  const [showFilePopup, setShowFilePopup] = useState(false);
  const [showAvatarPopup, setShowAvatarPopup] = useState(false);
  const [showTablePopup, setShowTablePopup] = useState(false);

  if (value === null || value === undefined || value === '') {
    return <span className="field-empty">-</span>;
  }

  const optionStyle = (() => {
    if (!field.option_style) return { defaultColor: '#666666', defaultBorderRadius: 'rounded' };
    if (typeof field.option_style === 'object') return field.option_style;
    try { return JSON.parse(field.option_style); } catch { return { defaultColor: '#666666', defaultBorderRadius: 'rounded' }; }
  })();

  const getBadgeStyle = (opt) => {
    const color = opt.color || optionStyle.defaultColor || '#666666';
    const radius = opt.borderRadius || optionStyle.defaultBorderRadius || 'rounded';
    const radiusMap = { square: '2px', 'rounded-sm': '4px', rounded: '8px', 'rounded-full': '9999px' };
    return {
      display: 'inline-block', padding: '2px 10px', fontSize: 12, fontWeight: 500,
      color: '#fff', backgroundColor: color, borderRadius: radiusMap[radius] || '8px'
    };
  };

  const parsedOptions = (() => {
    if (!field.options) return [];
    if (Array.isArray(field.options)) return field.options;
    try {
      const parsed = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  const resolveOption = (val) => {
    if (field.data_list_id && dataListOptions[field.data_list_id]) {
      const map = dataListOptions[field.data_list_id];
      const col = field.data_list_column;
      const uniq = map.unique?.[col] || [];
      if (uniq.includes(val)) return { value: val, label: getDataListLabelFromMap(map, field, val) };
    }
    return parsedOptions.find(o => (o.value || o) === val) || null;
  };

  switch (field.type) {
    case 'password':
      return <span>********</span>;

    case 'boolean':
      return <span className={value ? 'field-true' : 'field-false'}>{value ? '✓' : ''}</span>;

    case 'number': {
      const formatted = formatNumber(value, {
        format: field.display_format || field.number_format || 'plain',
        decimalPlaces: field.decimal_places,
        unit: field.unit
      });
      return <span>{formatted}</span>;
    }

    case 'select': {
      const opt = resolveOption(value);
      if (!opt) return <span>{value}</span>;
      if (opt.optionType === 'number') {
        const displayVal = formatNumber(value, { format: opt.numberFormat || field.number_format || 'plain' });
        return <span style={getBadgeStyle(opt)}>{displayVal}</span>;
      }
      return <span style={getBadgeStyle(opt)}>{opt.label || value}</span>;
    }

    case 'multiselect': {
      const vals = Array.isArray(value) ? value : [];
      if (vals.length === 0) return <span className="field-empty">-</span>;
      return (
        <span className="inline-flex flex-wrap gap-1">
          {vals.map((v, i) => {
            const opt = resolveOption(v);
            if (opt) {
              if (opt.optionType === 'number') {
                const displayVal = formatNumber(v, { format: opt.numberFormat || field.number_format || 'plain' });
                return <span key={i} style={getBadgeStyle(opt)}>{displayVal}</span>;
              }
              return <span key={i} style={getBadgeStyle(opt)}>{opt.label || v}</span>;
            }
            return <span key={i} className="text-xs text-gray-500">{v}</span>;
          })}
        </span>
      );
    }

    case 'file': {
      const files = Array.isArray(value) ? value : [value];
      if (files.length === 0 || !files[0]) return <span className="field-empty">-</span>;
      const fieldKey = field.field_key || field.key || '';
      const isAvatarField = fieldKey === 'avatar';
      if (isAvatarField) {
        const firstFile = files[0];
        const imgUrl = getFileUrl(firstFile, entity, entityId);
        return (
          <>
            <div
              className="avatar-mini"
              onClick={() => setShowAvatarPopup(true)}
              title={firstFile.original_name || firstFile.name || 'Xem ảnh'}
            >
              {imgUrl ? (
                <img src={imgUrl} alt={firstFile.original_name || ''} />
              ) : (
                <span className="avatar-placeholder">?</span>
              )}
            </div>
            {showAvatarPopup && (
              <div className="avatar-popup-overlay" onClick={() => setShowAvatarPopup(false)}>
                <div className="avatar-popup" onClick={(e) => e.stopPropagation()}>
                  <button className="avatar-popup-close" onClick={() => setShowAvatarPopup(false)}>✕</button>
                  <img src={imgUrl} alt={firstFile.original_name || ''} />
                  <div className="avatar-popup-name">{firstFile.original_name || ''}</div>
                </div>
              </div>
            )}
          </>
        );
      }
      return (
        <>
          <span
            className="field-file-btn view-btn"
            onClick={() => setShowFilePopup(true)}
          >
            Xem file ({files.length})
          </span>
          {showFilePopup && (
            <Suspense fallback={<div className="loading">Đang tải...</div>}>
              <FileListPopup files={files} onClose={() => setShowFilePopup(false)} entity={entity} entityId={entityId} />
            </Suspense>
          )}
        </>
      );
    }

    case 'date': {
      try {
        const d = new Date(value);
        const fmt = field.date_format || 'DD/MM/YYYY';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const formatted = fmt.replace('DD', day).replace('MM', month).replace('YYYY', year);
        return <span>{formatted}</span>;
      } catch {
        return <span>{value}</span>;
      }
    }

    case 'datetime': {
      try {
        const d = new Date(value);
        const fmt = field.date_format || 'DD/MM/YYYY';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const datePart = fmt.replace('DD', day).replace('MM', month).replace('YYYY', year);
        return <span>{datePart} {hours}:{mins}</span>;
      } catch {
        return <span>{value}</span>;
      }
    }

    case 'url':
      return <span className="text-indigo-500">{value}</span>;

    case 'email':
      return <span>{value}</span>;

    case 'phone':
      return <span>{value}</span>;

    case 'textarea':
      return <span title={value}>{String(value).substring(0, 100)}{String(value).length > 100 ? '...' : ''}</span>;

    case 'formula': {
      if (!field.formula_config) return <span>{String(value)}</span>;
      if (field.formula_config.outputType === 'url') {
        return <a href={value} target="_blank" rel="noopener noreferrer" className="text-indigo-500">{field.formula_config.label || value}</a>;
      }
      return <span>{String(value)}</span>;
    }

    case 'table': {
      const rows = Array.isArray(value) ? value : [];
      if (rows.length === 0) return <span className="field-empty">-</span>;
      const tc = (() => {
        if (!field.source_config) return {};
        if (typeof field.source_config === 'object') return field.source_config;
        try { return JSON.parse(field.source_config); } catch { return {}; }
      })();
      const columns = tc.columns || [];
      const computeCell = (col, row) => {
        if (col.formula) {
          try { return math.evaluate(col.formula, row); } catch { return '#ERR'; }
        }
        return row[col.key] ?? '-';
      };
      return (
        <>
          <span
            className="field-file-btn view-btn"
            onClick={() => setShowTablePopup(true)}
            style={{ cursor: 'pointer' }}
          >
            📋 {rows.length} dòng
          </span>
          {showTablePopup && (
            <div className="modal-overlay" onClick={() => setShowTablePopup(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="legacy-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: 16, maxHeight: '80vh', overflow: 'auto', minWidth: 400 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{field.label || field.key} — {rows.length} dòng</h3>
                  <button className="btn btn-xs btn-ghost" onClick={() => setShowTablePopup(false)}>✕</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'center', width: 40 }}>STT</th>
                      {columns.map(col => (
                        <th key={col.key} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'left' }}>
                          {col.label || col.key}
                          {col.formula && <Zap size={10} style={{ color: '#d97706', marginLeft: 2, verticalAlign: 'middle' }} />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#999' }}>{idx + 1}</td>
                        {columns.map(col => (
                          <td key={col.key} style={{ padding: '4px 6px', border: '1px solid #e2e8f0', background: col.formula ? '#f0fdf4' : undefined }}>
                            {(() => { const v = computeCell(col, row); return typeof v === 'number' ? v.toLocaleString() : v; })()}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {columns.some(col => col.footer_formula) && (
                    <tfoot>
                      <tr>
                        <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', background: '#f1f5f9', textAlign: 'center', fontWeight: 700 }}></td>
                        {columns.map(col => {
                          if (!col.footer_formula) return <td key={col.key} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', background: '#f1f5f9' }}></td>;
                          const values = rows.map(r => {
                            const raw = computeCell(col, r);
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
                          return <td key={col.key} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', background: '#f1f5f9', fontWeight: 700, color: '#1e40af' }}><span style={{ fontSize: 11, color: '#6b7280', marginRight: 4 }}>{label}:</span>{typeof footerVal === 'number' ? footerVal.toLocaleString() : footerVal}</td>;
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      );
    }

    default:
      return <span>{String(value)}</span>;
  }
};

export default FieldRenderer;
