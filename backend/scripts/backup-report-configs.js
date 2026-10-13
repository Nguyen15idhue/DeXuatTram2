require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/utils/db');

const OUT_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const sqlStr = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);

const sqlJson = (v) => {
  if (v === null || v === undefined) return 'NULL';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return sqlStr(s);
};

async function dumpTable(name, sql) {
  const [rows] = await pool.query(sql);
  const lines = rows.map((r) => {
    const cols = Object.keys(r).map((k) => `\`${k}\``).join(', ');
    const vals = Object.values(r).map((v) => {
      if (v instanceof Date) return sqlStr(v.toISOString().slice(0, 19).replace('T', ' '));
      if (Buffer.isBuffer(v)) return sqlStr(v.toString());
      return sqlJson(v);
    }).join(', ');
    return `INSERT INTO \`${name}\` (${cols}) VALUES (${vals});`;
  });
  return { count: rows.length, lines };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dash = await dumpTable('report_dashboard_configs', 'SELECT * FROM report_dashboard_configs ORDER BY id');
  const builder = await dumpTable('report_builder_dashboards', 'SELECT * FROM report_builder_dashboards ORDER BY id');

  const header = [
    '-- Backup cấu hình báo cáo (report_dashboard_configs + report_builder_dashboards)',
    `-- Generated: ${new Date().toISOString()}`,
    '-- Khôi phục: docker exec -i station-mysql mysql -u root -ppassword station_management --default-character-set=utf8mb4 < <file>',
    'START TRANSACTION;',
    'DELETE FROM `report_dashboard_configs`;',
    'DELETE FROM `report_builder_dashboards`;',
  ];
  const content = [...header, ...dash.lines, ...builder.lines, 'COMMIT;', ''].join('\n');

  const file = path.join(OUT_DIR, `report-config-${stamp()}.sql`);
  fs.writeFileSync(file, content, 'utf8');

  console.log(`[backup-report-configs] report_dashboard_configs: ${dash.count} row(s)`);
  console.log(`[backup-report-configs] report_builder_dashboards: ${builder.count} row(s)`);
  console.log(`[backup-report-configs] -> ${file}`);

  const reportWidgets = dash.lines.length;
  const dashRows = await pool.query('SELECT dashboard_key, layout_json FROM report_dashboard_configs');
  dashRows[0].forEach((r) => {
    let layout = r.layout_json;
    if (typeof layout === 'string') { try { layout = JSON.parse(layout); } catch { layout = null; } }
    const n = Array.isArray(layout) ? layout.length : (layout && layout.sections ? layout.sections.length : 0);
    console.log(`  - ${r.dashboard_key}: ${n} phần tử`);
  });
  void reportWidgets;

  process.exit(0);
}

main().catch((e) => { console.error('[backup-report-configs] FAIL:', e.message); process.exit(1); });
