import { useState, useEffect } from 'react';
import { fieldDefinitionService, dataListService } from '../services/api';

const cache = {};

export const clearFieldOptionsCache = (entity) => {
  if (entity) {
    delete cache[entity];
  } else {
    Object.keys(cache).forEach(k => delete cache[k]);
  }
};

const useFieldOptions = (entity) => {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dlOptions, setDlOptions] = useState({});

  useEffect(() => {
    if (!entity) { setLoading(false); return; }

    if (cache[entity]) {
      setFields(cache[entity]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fieldDefinitionService.getByEntity(entity);
        if (!cancelled && res.success) {
          cache[entity] = res.data;
          setFields(res.data);
        }
      } catch {
        if (!cancelled) setFields([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entity]);

  useEffect(() => {
    const ids = [...new Set((fields || []).filter(f => f.data_list_id).map(f => f.data_list_id))];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(ids.map(async (id) => {
        try {
          const res = await dataListService.getById(id);
          if (res.success && res.data) {
            const cols = res.data.columns_config || [];
            const rows = res.data.rows || [];
            const perCol = {};
            cols.forEach(col => {
              const seen = new Set();
              rows.forEach(r => {
                const v = r.data?.[col.key];
                if (v !== null && v !== undefined && v !== '' && !seen.has(v)) seen.add(v);
              });
              perCol[col.key] = [...seen].map(v => ({ value: v, label: v }));
            });
            return [id, perCol];
          }
        } catch { /* silent */ }
        return [id, null];
      }));
      if (!cancelled) {
        const next = {};
        entries.forEach(([id, m]) => { if (m) next[id] = m; });
        setDlOptions(next);
      }
    })();
    return () => { cancelled = true; };
  }, [fields]);

  const getSelectOptions = (key) => {
    const field = fields.find(f => f.key === key);
    if (!field) return [];
    if (Array.isArray(field.options) && field.options.length > 0) return field.options;
    if (typeof field.options === 'string') {
      try {
        const parsed = JSON.parse(field.options);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* silent */ }
    }
    if (field.data_list_id && field.data_list_column) {
      return (dlOptions[field.data_list_id] && dlOptions[field.data_list_id][field.data_list_column]) || [];
    }
    return [];
  };

  const fetchChildOptions = async (key, parentValue) => {
    const field = fields.find(f => f.key === key);
    if (!field || !field.data_list_id || !field.data_list_column || !field.parent_field) return [];
    if (parentValue === undefined || parentValue === null || parentValue === '') return [];
    try {
      const res = await dataListService.getChildren(field.data_list_id, field.data_list_column, field.parent_field, parentValue);
      if (res.success) return res.data?.options || [];
    } catch { /* silent */ }
    return [];
  };

  const getFieldLabel = (key) => {
    const field = fields.find(f => f.key === key);
    return field ? field.label : key;
  };

  return { fields, loading, getSelectOptions, getFieldLabel, fetchChildOptions };
};

export default useFieldOptions;
