import { useState } from 'react';
import { getDataListLabelFromMap } from '../../utils/dataListLabel';

const DynamicFilter = ({ columns, filters, onChange, dataListOptions = {} }) => {
  const [localFilters, setLocalFilters] = useState(filters || {});

  const filterableColumns = columns.filter(c => c.filterable);

  if (filterableColumns.length === 0) return null;

  const handleChange = (key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    if (value === '' || value === null || value === undefined) {
      delete newFilters[key];
    }
    setLocalFilters(newFilters);
  };

  const handleApply = () => {
    if (onChange) onChange(localFilters);
  };

  const handleReset = () => {
    setLocalFilters({});
    if (onChange) onChange({});
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleApply();
  };

  return (
    <div className="dynamic-filter">
      {filterableColumns.map(col => {
        const key = col.field_key || col.key;
        const label = col.field_label || col.label;
        const type = col.field_type || col.type;

        if (type === 'select') {
          const parsedOptions = (() => {
            if (col.data_list_id && dataListOptions[col.data_list_id]) {
              const map = dataListOptions[col.data_list_id];
              const uniq = map.unique?.[col.data_list_column] || [];
              if (uniq.length > 0) return uniq.map(v => ({ value: v, label: getDataListLabelFromMap(map, col, v) }));
            }
            if (!col.options) return [];
            if (Array.isArray(col.options)) return col.options;
            try {
              const parsed = typeof col.options === 'string' ? JSON.parse(col.options) : col.options;
              return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
          })();
          return (
            <div key={key} className="dynamic-filter-item">
              <label>{label}</label>
              <select value={localFilters[key] || ''} onChange={(e) => handleChange(key, e.target.value)} onKeyDown={handleKeyDown}>
                <option value="">Tất cả</option>
                {parsedOptions.map((opt, idx) => (
                  <option key={idx} value={opt.value || opt}>{opt.label || opt}</option>
                ))}
              </select>
            </div>
          );
        }

        if (type === 'date' || type === 'datetime') {
          return (
            <div key={key} className="dynamic-filter-item">
              <label>{label}</label>
              <input
                type={type === 'datetime' ? 'datetime-local' : 'date'}
                value={localFilters[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          );
        }

        if (type === 'boolean') {
          return (
            <div key={key} className="dynamic-filter-item">
              <label>{label}</label>
              <select value={localFilters[key] || ''} onChange={(e) => handleChange(key, e.target.value)} onKeyDown={handleKeyDown}>
                <option value="">Tất cả</option>
                <option value="true">Có</option>
                <option value="false">Không</option>
              </select>
            </div>
          );
        }

        return (
          <div key={key} className="dynamic-filter-item">
            <label>{label}</label>
            <input
              type="text"
              value={localFilters[key] || ''}
              onChange={(e) => handleChange(key, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Lọc theo ${label}`}
            />
          </div>
        );
      })}
      <div className="dynamic-filter-item flex-row gap-1.5 items-end">
        <button className="btn btn-primary btn-sm" onClick={handleApply}>Lọc</button>
        <button className="btn btn-secondary btn-sm" onClick={handleReset}>Đặt lại</button>
      </div>
    </div>
  );
};

export default DynamicFilter;
