import { useState } from 'react';
import FileListPopup from './FileListPopup';

const FieldRenderer = ({ field, value }) => {
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
      const formatted = Number(value).toLocaleString('vi-VN');
      return <span>{formatted}</span>;
    }

    case 'select': {
      const opt = parsedOptions.find(o => (o.value || o) === value);
      if (!opt) return <span>{value}</span>;
      return <span style={getBadgeStyle(opt)}>{opt.label || value}</span>;
    }

    case 'multiselect': {
      const vals = Array.isArray(value) ? value : [];
      if (vals.length === 0) return <span className="field-empty">-</span>;
      return (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
          {vals.map((v, i) => {
            const opt = parsedOptions.find(o => (o.value || o) === v);
            return opt ? (
              <span key={i} style={getBadgeStyle(opt)}>{opt.label || v}</span>
            ) : (
              <span key={i} style={{ fontSize: 12, color: '#666' }}>{v}</span>
            );
          })}
        </span>
      );
    }

    case 'file': {
      const files = Array.isArray(value) ? value : [value];
      if (files.length === 0 || !files[0]) return <span className="field-empty">-</span>;
      const [showPopup, setShowPopup] = useState(false);
      return (
        <>
          <span
            className="field-file-button"
            style={{ display: 'inline-block', padding: '2px 10px', fontSize: 12, background: '#e8f0fe', color: '#4a6cf7', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => setShowPopup(true)}
          >
            Xem file ({files.length})
          </span>
          {showPopup && <FileListPopup files={files} onClose={() => setShowPopup(false)} />}
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

    default:
      return <span>{String(value)}</span>;
  }
};

export default FieldRenderer;
