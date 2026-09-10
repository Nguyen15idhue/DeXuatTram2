import { useState, useEffect } from 'react';
import { dataListService } from '../services/api';

const buildMaps = (columnsConfig, rows) => {
  const tree = {};
  const unique = {};
  columnsConfig.forEach(col => { tree[col.key] = {}; unique[col.key] = []; });
  (rows || []).forEach(r => {
    const data = r.data || {};
    columnsConfig.forEach(col => {
      const val = data[col.key];
      if (!val) return;
      if (!tree[col.key][val]) tree[col.key][val] = [];
      tree[col.key][val].push({ value: val, label: val, _raw: data });
      if (!unique[col.key].includes(val)) unique[col.key].push(val);
    });
  });
  return { tree, unique };
};

const useDataListMap = (dataListIds) => {
  const [maps, setMaps] = useState({});
  const key = [...new Set((dataListIds || []).filter(Boolean))].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!key) { setMaps({}); return; }
    let cancelled = false;
    (async () => {
      const ids = key.split(',').map(Number);
      const entries = await Promise.all(ids.map(async (id) => {
        try {
          const res = await dataListService.getById(id);
          if (res.success && res.data) {
            return [id, buildMaps(res.data.columns_config || [], res.data.rows || [])];
          }
        } catch { /* silent */ }
        return [id, null];
      }));
      if (!cancelled) {
        const next = {};
        entries.forEach(([id, m]) => { if (m) next[id] = m; });
        setMaps(next);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  return maps;
};

export default useDataListMap;
