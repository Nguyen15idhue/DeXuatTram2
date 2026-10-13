import { useEffect, useRef, useState } from 'react';
import { builderService } from '../services/api';
import { mergeControlFilters } from '../utils/reportModel';

const sig = (w, filters) => JSON.stringify({
  ds: w.dataSourceId, dc: w.dataConfig, filters,
});

export default function useReportPreviews(widgets, controls, token) {
  const [map, setMap] = useState({});
  const pending = useRef(new Set());

  useEffect(() => {
    if (!token) return;
    (widgets || []).forEach(async (w) => {
      if (!w.dataSourceId) return;
      const isData = ['chart', 'table', 'kpi'].includes(w.type);
      const isControlOpts = w.type === 'control' && w.controlType === 'select' && w.field;
      if (!isData && !isControlOpts) return;
      const filters = isData ? mergeControlFilters(w, widgets, controls) : [];
      const key = isData
        ? sig(w, filters)
        : JSON.stringify({ opts: w.dataSourceId, field: w.field });
      const cacheKey = `${w.id}:${key}`;
      if (pending.current.has(cacheKey)) return;
      pending.current.add(cacheKey);
      try {
        const payload = isData
          ? {
            dataset: w.dataSourceId,
            dimension: w.dataConfig.dimension,
            metric: w.dataConfig.metric,
            agg: w.dataConfig.agg,
            filters,
            sort: w.dataConfig.sort,
            limit: w.dataConfig.limit,
          }
          : {
            dataset: w.dataSourceId,
            dimension: w.field,
            metric: 'id',
            agg: 'count',
            filters: [],
            sort: 'dim_asc',
            limit: 200,
          };
        const res = await builderService.previewWidget(payload, token);
        const rows = (res && res.success && res.data && res.data.rows) ? res.data.rows : [];
        const entry = isData
          ? { key, rows }
          : { key, options: rows.map((r) => (r.dim === null ? '' : String(r.dim))).filter((x) => x !== '') };
        setMap((prev) => ({ ...prev, [w.id]: entry }));
      } catch {
        setMap((prev) => ({ ...prev, [w.id]: isData ? { key, rows: [] } : { key, options: [] } }));
      } finally {
        pending.current.delete(cacheKey);
      }
    });
  }, [widgets, controls, token]);

  return map;
}
