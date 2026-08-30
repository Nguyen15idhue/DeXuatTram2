const FieldRenderer = ({ field, value }) => {
  if (value === null || value === undefined || value === '') {
    return <span className="field-empty">-</span>;
  }

  switch (field.type) {
    case 'boolean':
      return <span className={value ? 'field-true' : 'field-false'}>{value ? '✓' : '✗'}</span>;

    case 'number':
      return <span>{Number(value).toLocaleString()}</span>;

    case 'select': {
      const parsedOptions = (() => {
        if (!field.options) return [];
        if (Array.isArray(field.options)) return field.options;
        try {
          const parsed = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })();
      const opt = parsedOptions.find(o => (o.value || o) === value);
      return <span>{opt ? (opt.label || opt) : value}</span>;
    }

    case 'multiselect': {
      const parsedOptions = (() => {
        if (!field.options) return [];
        if (Array.isArray(field.options)) return field.options;
        try {
          const parsed = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })();
      const vals = Array.isArray(value) ? value : [];
      const labels = vals.map(v => {
        const opt = parsedOptions.find(o => (o.value || o) === v);
        return opt ? (opt.label || opt) : v;
      });
      return <span>{labels.join(', ')}</span>;
    }

    case 'file':
      if (Array.isArray(value)) {
        return <span>{value.length} file(s)</span>;
      }
      return <span>{typeof value === 'string' ? value.split('/').pop() : 'File'}</span>;

    case 'date': {
      try {
        const d = new Date(value);
        return <span>{d.toLocaleDateString('vi-VN')}</span>;
      } catch {
        return <span>{value}</span>;
      }
    }

    case 'datetime': {
      try {
        const d = new Date(value);
        return <span>{d.toLocaleString('vi-VN')}</span>;
      } catch {
        return <span>{value}</span>;
      }
    }

    case 'url':
      return <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>;

    case 'email':
      return <a href={`mailto:${value}`}>{value}</a>;

    case 'phone':
      return <a href={`tel:${value}`}>{value}</a>;

    case 'textarea':
      return <span title={value}>{String(value).substring(0, 100)}{String(value).length > 100 ? '...' : ''}</span>;

    default:
      return <span>{String(value)}</span>;
  }
};

export default FieldRenderer;
