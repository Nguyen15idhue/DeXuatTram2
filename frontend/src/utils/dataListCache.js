import { dataListService } from '../services/api';

const cache = new Map();
const inflight = new Map();

export async function fetchDataList(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  if (inflight.has(id)) return inflight.get(id);
  const promise = dataListService.getById(id)
    .then((res) => {
      const data = res && res.success ? res.data : null;
      if (data) {
        cache.set(id, { columns_config: data.columns_config || [], rows: data.rows || [] });
      }
      return cache.get(id) || null;
    })
    .catch(() => null)
    .finally(() => inflight.delete(id));
  inflight.set(id, promise);
  return promise;
}

export function clearDataListCache(id) {
  if (id === undefined || id === null) cache.clear();
  else cache.delete(id);
}

export function buildDataListMaps(columnsConfig, rows) {
  const tree = {};
  const unique = {};
  const seen = {};
  columnsConfig.forEach(col => { tree[col.key] = {}; unique[col.key] = []; seen[col.key] = new Set(); });
  (rows || []).forEach(r => {
    const data = r.data || {};
    columnsConfig.forEach(col => {
      const val = data[col.key];
      if (val === null || val === undefined || val === '') return;
      if (!tree[col.key][val]) tree[col.key][val] = [];
      tree[col.key][val].push({ value: val, label: val, _raw: data });
      if (!seen[col.key].has(val)) { seen[col.key].add(val); unique[col.key].push(val); }
    });
  });
  return { tree, unique };
}
