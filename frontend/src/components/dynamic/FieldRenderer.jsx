import { useState, lazy, Suspense } from 'react';
import { formatNumber } from '../../utils/formatNumber';

const FileListPopup = lazy(() => import('./FileListPopup'));

const FieldRenderer = ({ field, value, entity, entityId }) => {
  const [showFilePopup, setShowFilePopup] = useState(false);

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

  switch (field.type) {
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
      const opt = parsedOptions.find(o => (o.value || o) === value);
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
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
          {vals.map((v, i) => {
            const opt = parsedOptions.find(o => (o.value || o) === v);
            if (opt) {
              if (opt.optionType === 'number') {
                const displayVal = formatNumber(v, { format: opt.numberFormat || field.number_format || 'plain' });
                return <span key={i} style={getBadgeStyle(opt)}>{displayVal}</span>;
              }
              return <span key={i} style={getBadgeStyle(opt)}>{opt.label || v}</span>;
            }
            return <span key={i} style={{ fontSize: 12, color: '#666' }}>{v}</span>;
          })}
        </span>
      );
    }

    case 'file': {
      const files = Array.isArray(value) ? value : [value];
      if (files.length === 0 || !files[0]) return <span className="field-empty">-</span>;
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
      return <span style={{ color: '#4a6cf7' }}>{value}</span>;

    case 'email':
      return <span>{value}</span>;

    case 'phone':
      return <span>{value}</span>;

    case 'textarea':
      return <span title={value}>{String(value).substring(0, 100)}{String(value).length > 100 ? '...' : ''}</span>;

    case 'formula': {
      if (!field.formula_config) return <span>{String(value)}</span>;
      if (field.formula_config.outputType === 'url') {
        return <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: '#4a6cf7' }}>{field.formula_config.label || value}</a>;
      }
      return <span>{String(value)}</span>;
    }

    default:
      return <span>{String(value)}</span>;
  }
};

export default FieldRenderer;
