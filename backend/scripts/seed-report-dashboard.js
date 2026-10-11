require('dotenv').config();
const pool = require('../src/utils/db');

const W = (id, title, o) => ({ id, version: 2, title, layout: o.layout, ...o });
const DEFAULT_WIDGETS = [
  W('seed_k1', 'Tổng Lead', { type: 'kpi', dataSourceId: 'leads', dataConfig: { dimension: 'id', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'kpi', numberFormat: 'plain' }, layout: { x: 0, y: 0, w: 3, h: 2 } }),
  W('seed_k2', 'Tổng Đề xuất', { type: 'kpi', dataSourceId: 'proposals', dataConfig: { dimension: 'id', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'kpi', numberFormat: 'plain' }, layout: { x: 3, y: 0, w: 3, h: 2 } }),
  W('seed_k3', 'Tổng Trạm', { type: 'kpi', dataSourceId: 'stations', dataConfig: { dimension: 'id', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'kpi', numberFormat: 'plain' }, layout: { x: 6, y: 0, w: 3, h: 2 } }),
  W('seed_k4', 'Lead → ON', { type: 'kpi', dataSourceId: 'leads', dataConfig: { dimension: 'id', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'kpi', numberFormat: 'plain' }, layout: { x: 9, y: 0, w: 3, h: 2 } }),
  W('seed_c1', 'Lead theo stage', { type: 'chart', dataSourceId: 'leads', dataConfig: { dimension: 'stage', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'bar', showLegend: false, showLabels: true, numberFormat: 'plain' }, layout: { x: 0, y: 2, w: 6, h: 5 } }),
  W('seed_c2', 'Lead theo nguồn', { type: 'chart', dataSourceId: 'leads', dataConfig: { dimension: 'source', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'donut', showLegend: true, numberFormat: 'plain' }, layout: { x: 6, y: 2, w: 6, h: 5 } }),
  W('seed_c3', 'Đề xuất theo trạng thái', { type: 'table', dataSourceId: 'proposals', dataConfig: { dimension: 'status', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 }, visualConfig: { chartType: 'table' }, layout: { x: 0, y: 7, w: 6, h: 5 } }),
  W('seed_d1', 'Bảng chi tiết Lead → ON', { type: 'detail', layout: { x: 6, y: 7, w: 6, h: 5 } }),
];

async function main() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM report_builder_dashboards');
  if (n > 0) {
    console.log(`[seed-report-dashboard] đã có ${n} báo cáo — bỏ qua (idempotent).`);
    process.exit(0);
  }
  const layout = { version: 2, page: { title: 'Báo cáo tổng hợp', columns: 12, rowHeight: 80 }, widgets: DEFAULT_WIDGETS };
  await pool.query(
    'INSERT INTO report_builder_dashboards (name, layout_json, created_by, updated_by) VALUES (?, ?, ?, ?)',
    ['Báo cáo tổng hợp', JSON.stringify(layout), 1, 1]
  );
  console.log('[seed-report-dashboard] đã tạo báo cáo mặc định "Báo cáo tổng hợp".');
  process.exit(0);
}

main().catch((e) => { console.error('[seed-report-dashboard] FAIL:', e.message); process.exit(1); });
