import { useState, useEffect } from 'react';
import { dataListService } from '../services/api';

export const useDataList = (dataListId, token) => {
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
        const res = await dataListService.getById(dataListId, token);
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
  }, [dataListId, token]);

  return { options, columns, loading };
};
