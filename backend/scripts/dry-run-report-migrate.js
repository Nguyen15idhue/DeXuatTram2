require('dotenv').config();
const pool = require('../src/utils/db');

const CHART_WHITELIST = ['kpi', 'bar', 'line', 'pie', 'funnel', 'table', 'echarts_bar', 'dwell'];
const METRICS = [
  'lead_funnel', 'lead_by_stage', 'lead_by_classification', 'lead_by_source', 'lead_by_province',
  'lead_by_region', 'lead_by_department', 'lead_by_assignee', 'proposal_by_status', 'conversion_rates',
  'average_duration', 'pipeline_over_time', 'stuck_items', 'unassigned_leads', 'proposals_without_lead',
  'stations_without_proposal', 'journey_sync_errors', 'oneoffice_coverage', 'stuck_node',
  'sync_staleness', 'automation_failures', 'lead360_sections',
];
const SIZE_TO_W = { sm: 4, md: 6, lg: 8, full: 12 };

const parseJson = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

function inspectWidget(w, idx) {
  const errors = [];
  if (!w || typeof w !== 'object') return [`#${idx + 1} không phải object`];
  const chart = w.chart || 'table';
  if (!CHART_WHITELIST.includes(chart)) errors.push(`chart lạ: ${chart}`);
  if (w.kind === 'detail') return errors;
  if (w.dataset) return errors;
  if (!METRICS.includes(w.metric)) errors.push(`metric lạ/thiếu: ${w.metric || '(trống)'}`);
  return errors;
}

function mapV2(w, i) {
  const size = w.size || 'md';
  const wv = SIZE_TO_W[size] || 6;
  return { hasLayout: !!w.layout, hasId: !!(w.id), w: wv };
}

async function main() {
  const [rows] = await pool.query(
    'SELECT id, dashboard_key, layout_json FROM report_dashboard_configs ORDER BY id'
  );
  let totalWidgets = 0;
  let totalErrors = 0;
  const breakpoints = [];
  rows.forEach((r) => {
    const layout = parseJson(r.layout_json);
    const widgets = Array.isArray(layout) ? layout : [];
    if (!Array.isArray(layout) && layout && layout.sections) {
      console.log(`[dry-run] dashboard ${r.id} (${r.dashboard_key}): layout sections=${layout.sections.length} — bỏ qua (không phải widget)`);
      return;
    }
    const mapped = widgets.map((w, i) => {
      const errs = inspectWidget(w, i);
      if (errs.length > 0) { totalErrors += errs.length; breakpoints.push({ dashboard: r.dashboard_key, idx: i, errs }); }
      return mapV2(w, i);
    });
    totalWidgets += widgets.length;
    const needLayout = mapped.filter((m) => !m.hasLayout).length;
    const needId = mapped.filter((m) => !m.hasId).length;
    console.log(`[dry-run] dashboard ${r.id} (${r.dashboard_key}): ${widgets.length} widget | cần gán layout: ${needLayout} | cần gán id: ${needId}`);
  });

  console.log(`[dry-run] TỔNG: ${rows.length} dashboard, ${totalWidgets} widget, ${totalErrors} lỗi map.`);
  if (breakpoints.length > 0) {
    breakpoints.forEach((b) => console.log(`  ✗ ${b.dashboard} #${b.idx + 1}: ${b.errs.join('; ')}`));
    console.log('[dry-run] KẾT QUẢ: KHÔNG ĐẠT (còn lỗi).');
  } else {
    console.log('[dry-run] KẾT QUẢ: ĐẠT — map 100% widget, có thể rollout.');
  }
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[dry-run-report-migrate] FAIL:', e.message); process.exit(1); });
