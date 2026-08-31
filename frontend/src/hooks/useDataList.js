import { useState, useEffect } from 'react';
import { api } from '../services/api';

export const useDataList = (dataListId) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState([]);

  useEffect(() => {
    if (!dataListId) {
      setOptions([]);
      setColumns([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.dataListService.getById(dataListId);
        if (!cancelled && res.success && res.data) {
          const cols = res.data.columns_config || [];
          setColumns(cols);
          setOptions((res.data.rows || []).map(r => ({
            value: cols.length > 0 ? (r.data[cols[0].key] || '') : '',
            label: cols.length > 0 ? (r.data[cols[0].key] || '') : '',
            _raw: r.data
          })));
        }
      } catch {
        if (!cancelled) { setOptions([]); setColumns([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dataListId]);

  return { options, columns, loading };
};
