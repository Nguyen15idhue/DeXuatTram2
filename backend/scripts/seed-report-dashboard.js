require('dotenv').config();
const pool = require('../src/utils/db');

const chart = (id, title, ds, dimension, o = {}) => ({
  id, version: 2, type: o.type || 'chart', title, layout: o.layout,
  dataSourceId: ds,
  dataConfig: { dimension, metric: 'id', agg: o.agg || 'count', filters: o.filters || [], sort: o.sort || 'value_desc', limit: o.limit || 20 },
  visualConfig: { chartType: o.chartType || 'bar', palette: 'default', showLegend: !!o.showLegend, showLabels: !!o.showLabels, numberFormat: 'plain' },
});
const KPI_DIM = { leads: 'stage', proposals: 'status', stations: 'status', journey_events: 'action' };
const kpi = (id, title, ds, layout) => ({
  id, version: 2, type: 'kpi', title, layout, dataSourceId: ds,
  dataConfig: { dimension: KPI_DIM[ds] || 'stage', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 200 },
  visualConfig: { chartType: 'kpi', numberFormat: 'plain' },
});
const table = (id, title, ds, dimension, layout) => ({
  id, version: 2, type: 'table', title, layout, dataSourceId: ds,
  dataConfig: { dimension, metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 },
  visualConfig: { chartType: 'table' },
});
const control = (id, title, ctype, ds, field, layout, def = null) => ({
  id, version: 2, type: 'control', controlType: ctype, title, layout, dataSourceId: ds, field, defaultValue: def,
});

const REPORTS = [
  {
    name: 'Báo cáo tổng hợp',
    widgets: [
      control('t_d1', 'Khoảng thời gian', 'dateRange', 'leads', 'created_date', { x: 0, y: 0, w: 4, h: 2 }),
      control('t_r1', 'Vùng miền', 'select', 'leads', 'region', { x: 4, y: 0, w: 4, h: 2 }),
      kpi('t_k1', 'Tổng Lead', 'leads', { x: 0, y: 2, w: 3, h: 2 }),
      kpi('t_k2', 'Tổng Đề xuất', 'proposals', { x: 3, y: 2, w: 3, h: 2 }),
      kpi('t_k3', 'Tổng Trạm', 'stations', { x: 6, y: 2, w: 3, h: 2 }),
      kpi('t_k4', 'Sự kiện hành trình', 'journey_events', { x: 9, y: 2, w: 3, h: 2 }),
      chart('t_c1', 'Lead theo stage', 'leads', 'stage', { chartType: 'bar', showLabels: true, layout: { x: 0, y: 4, w: 6, h: 5 } }),
      chart('t_c2', 'Lead theo nguồn', 'leads', 'source', { chartType: 'donut', showLegend: true, layout: { x: 6, y: 4, w: 6, h: 5 } }),
      chart('t_c3', 'Lead theo tỉnh', 'leads', 'province', { chartType: 'barH', layout: { x: 0, y: 9, w: 6, h: 5 } }),
      chart('t_c4', 'Lead theo vùng', 'leads', 'region', { chartType: 'pie', showLegend: true, layout: { x: 6, y: 9, w: 6, h: 5 } }),
      chart('t_c5', 'Pipeline theo thời gian', 'leads', 'created_date', { chartType: 'line', sort: 'dim_asc', limit: 60, layout: { x: 0, y: 14, w: 12, h: 5 } }),
      table('t_t1', 'Đề xuất theo trạng thái', 'proposals', 'status', { x: 0, y: 19, w: 6, h: 5 }),
      table('t_t2', 'Trạm theo trạng thái', 'stations', 'status', { x: 6, y: 19, w: 6, h: 5 }),
      { id: 't_dt1', version: 2, type: 'detail', title: 'Bảng chi tiết Lead → ON', layout: { x: 0, y: 24, w: 12, h: 6 } },
    ],
  },
  {
    name: 'Báo cáo MKT',
    widgets: [
      control('m_d1', 'Khoảng thời gian', 'dateRange', 'leads', 'created_date', { x: 0, y: 0, w: 4, h: 2 }),
      control('m_s1', 'Nguồn Lead', 'select', 'leads', 'source', { x: 4, y: 0, w: 4, h: 2 }),
      control('m_c1', 'Phân loại KH', 'select', 'leads', 'customer_classification', { x: 8, y: 0, w: 4, h: 2 }),
      kpi('m_k1', 'Tổng Lead', 'leads', { x: 0, y: 2, w: 3, h: 2 }),
      kpi('m_k2', 'Lead có đề xuất', 'leads', { x: 3, y: 2, w: 3, h: 2 }),
      kpi('m_k3', 'Lead có trạm', 'leads', { x: 6, y: 2, w: 3, h: 2 }),
      kpi('m_k4', 'Sự kiện hành trình', 'journey_events', { x: 9, y: 2, w: 3, h: 2 }),
      chart('m_c1', 'Lead theo nguồn', 'leads', 'source', { chartType: 'pie', showLegend: true, layout: { x: 0, y: 4, w: 6, h: 5 } }),
      chart('m_c2', 'Lead theo phân loại', 'leads', 'customer_classification', { chartType: 'bar', showLabels: true, layout: { x: 6, y: 4, w: 6, h: 5 } }),
      chart('m_c3', 'Lead theo phòng ban', 'leads', 'assigned_department', { chartType: 'barH', layout: { x: 0, y: 9, w: 6, h: 5 } }),
      chart('m_c4', 'Lead theo vùng', 'leads', 'region', { chartType: 'donut', showLegend: true, layout: { x: 6, y: 9, w: 6, h: 5 } }),
      chart('m_c5', 'Lead theo tỉnh', 'leads', 'province', { chartType: 'bar', layout: { x: 0, y: 14, w: 6, h: 5 } }),
      table('m_t1', 'Lead theo phòng ban', 'leads', 'assigned_department', { x: 6, y: 14, w: 6, h: 5 }),
      chart('m_c6', 'Sự kiện theo hành động', 'journey_events', 'action', { chartType: 'bar', layout: { x: 0, y: 19, w: 12, h: 5 } }),
    ],
  },
];

async function ensureReport(name, widgets) {
  const [rows] = await pool.query('SELECT id FROM report_builder_dashboards WHERE name = ? LIMIT 1', [name]);
  if (rows.length > 0) {
    console.log(`[seed-report-dashboard] đã có "${name}" (id ${rows[0].id}) — bỏ qua.`);
    return;
  }
  const scaled = widgets.map((w) => ({ ...w, layout: { ...w.layout, y: w.layout.y * 4, h: w.layout.h * 4 } }));
  const layout = { version: 2, page: { title: name, columns: 12, rowHeight: 20 }, widgets: scaled };
  await pool.query(
    'INSERT INTO report_builder_dashboards (name, layout_json, created_by, updated_by) VALUES (?, ?, ?, ?)',
    [name, JSON.stringify(layout), 1, 1]
  );
  console.log(`[seed-report-dashboard] đã tạo "${name}" (${widgets.length} widget).`);
}

async function main() {
  for (const r of REPORTS) {
    await ensureReport(r.name, r.widgets);
  }
  process.exit(0);
}

main().catch((e) => { console.error('[seed-report-dashboard] FAIL:', e.message); process.exit(1); });
