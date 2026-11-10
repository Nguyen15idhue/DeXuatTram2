const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const BASE = process.env.ON_SHEET_BASE_URL || 'http://localhost:5173';
const email = `on-sheet-${crypto.randomUUID()}@example.invalid`;
const fixture = (cleanup) => JSON.parse(execFileSync('docker',
  ['exec', '-i', '-w', '/app', 'station-backend', 'node'], {
    encoding: 'utf8',
    input: `
const pool=require('./src/utils/db');
(async()=>{try {
  const email=${JSON.stringify(email)};
  if(${JSON.stringify(cleanup)}) {
    await pool.query('DELETE FROM users WHERE email=?',[email]);
    console.log('null');
  } else {
    const [result]=await pool.query("INSERT INTO users (full_name,email,password,role,status,custom_data) VALUES (?,?,'not-a-login-password','SUPER_ADMIN','ACTIVE','{}')",['ON sheet test',email]);
    console.log(JSON.stringify(require('./src/services/authService').generateToken(result.insertId,email,'SUPER_ADMIN')));
  }
}finally{await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
`
  }));

async function main() {
  let browser;
  try {
    const token = fixture(false);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    let syncCalls = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/admin/on-station-sheet-sync/**', async route => {
      if (new URL(route.request().url()).pathname.endsWith('/daily')) {
        syncCalls++;
        await route.fulfill({ json: { success: true, message: 'Đã xếp đồng bộ kiểm thử' } });
      } else {
        await route.fulfill({ json: { success: true, data: {
          configured: true, tabName: 'Test only', activeProposals: 1,
          queue: { pending: 0, processing: 0, failed: 1 },
          recentErrors: [{ proposal_id: 123, last_error: 'thiếu mã trạm EMS' }]
        } } });
      }
    });
    await page.goto(`${BASE}/login`);
    await page.evaluate(value => localStorage.setItem('token', value), token);
    await page.goto(`${BASE}/admin/on-tram/thong-tin-chung`);
    const button = page.getByRole('button', { name: 'Đồng bộ Sheet trạm ON', exact: true });
    await button.waitFor();
    await page.getByRole('alert').filter({ hasText: 'Đề xuất #123: thiếu mã trạm EMS' }).waitFor();
    await button.click();
    await page.getByText('Đã xếp đồng bộ kiểm thử', { exact: true }).waitFor();
    assert.equal(syncCalls, 1);
    assert.deepEqual(errors, []);
    console.log('PASS ON station UI: EMS error visible, sync button works, no runtime errors; Google requests mocked');
  } finally {
    if (browser) await browser.close();
    fixture(true);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
