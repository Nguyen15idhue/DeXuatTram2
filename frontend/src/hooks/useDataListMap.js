import { useState, useEffect } from 'react';
import { fetchDataList, buildDataListMaps } from '../utils/dataListCache';

const useDataListMap = (dataListIds) => {
  const [maps, setMaps] = useState({});
  const key = [...new Set((dataListIds || []).filter(Boolean))].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!key) { setMaps({}); return; }
    let cancelled = false;
    (async () => {
      const ids = key.split(',').map(Number);
      const entries = await Promise.all(ids.map(async (id) => {
        const data = await fetchDataList(id);
        if (data) return [id, buildDataListMaps(data.columns_config || [], data.rows || [])];
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
