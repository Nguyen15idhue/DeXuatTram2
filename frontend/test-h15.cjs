const { chromium } = require('playwright');
const ExcelJS = require('../backend/node_modules/exceljs');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function main() {
  const token = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json()).then(j => j.data?.token);
  const H = { Authorization: `Bearer ${token}` };
  const tbuf = Buffer.from(await (await fetch(`${API}/api/admin/excel/template?entity=stations`, { headers: H })).arrayBuffer());
  const wb0 = new ExcelJS.Workbook();
  await wb0.xlsx.load(tbuf);
  const headers = wb0.worksheets[0].getRow(1).values.slice(1).map(v => String(v ?? ''));
  const sample = wb0.worksheets[0].rowCount >= 2 ? wb0.worksheets[0].getRow(2).values.slice(1) : [];
  async function preview(rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S1');
    ws.addRow(headers);
    rows.forEach(r => ws.addRow(r));
    const buf = await wb.xlsx.writeBuffer();
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 't.xlsx');
    return fetch(`${API}/api/admin/excel/import/preview?entity=stations`, { method: 'POST', headers: H, body: fd }).then(r => r.json());
  }
  const emptyRow = headers.map(() => '');
  emptyRow[0] = 1;
  let j = await preview([emptyRow]);
  const errs = JSON.stringify(j.data?.errors || []);
  check('BE empty lat/lng flagged required', (j.data?.errorRows || 0) >= 1 && errs.includes('Vĩ độ') && errs.includes('Kinh độ'), errs.slice(0, 160));
  const okRow = headers.map((h, i) => {
    const l = h.toLowerCase();
    if (h === 'STT') return 1;
    if (l.includes('tên trạm')) return 'H15 OK';
    if (l.includes('vĩ độ')) return 10.5;
    if (l.includes('kinh độ')) return 106.7;
    if (l.includes('địa chỉ')) return 'H15 addr';
    if (l.includes('trạng thái')) return 'ACTIVE';
    if (l.includes('tỉnh')) return 'Thành phố Hà Nội';
    const s = sample[i];
    return (s === '' || s === null || s === undefined) ? '' : s;
  });
  j = await preview([okRow]);
  const fd0 = j.data?.rows?.[0]?.fixedData || {};
  check('BE valid row keeps real coords', j.data?.validRows === 1 && fd0.latitude === 10.5 && fd0.longitude === 106.7, `lat=${fd0.latitude} lng=${fd0.longitude}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs2 = [];
  page.on('pageerror', e => errs2.push(String(e).slice(0, 100)));
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/stations`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const importBtn = await page.locator('button:has-text("Import")').count();
  check('FE stations import UI present', importBtn > 0, `count=${importBtn}`);
  check('FE no page errors', errs2.length === 0, errs2.join('|').slice(0, 150));
  await browser.close();
  const failed = results.filter(x => !x.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  require('fs').writeFileSync('test-h15-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
