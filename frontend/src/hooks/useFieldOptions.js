import { useState, useEffect } from 'react';
import { fieldDefinitionService } from '../services/api';

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

  const getSelectOptions = (key) => {
    const field = fields.find(f => f.key === key);
    if (!field) return [];
    if (Array.isArray(field.options)) return field.options;
    if (typeof field.options === 'string') {
      try { return JSON.parse(field.options); } catch { return []; }
    }
    return [];
  };

  const getFieldLabel = (key) => {
    const field = fields.find(f => f.key === key);
    return field ? field.label : key;
  };

  return { fields, loading, getSelectOptions, getFieldLabel };
};

export default useFieldOptions;
