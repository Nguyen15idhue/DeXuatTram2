const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const dl4 = [];
  const apiCalls = [];
  page.on('response', (resp) => {
    const u = resp.url();
    if (!u.includes('/api/')) return;
    apiCalls.push(u.replace(BASE, ''));
    if (/\/api\/data-lists\/4(\?|$)/.test(u)) {
      dl4.push({ enc: resp.headers()['content-encoding'] || '', size: resp.headers()['content-length'] || '' });
    }
  });

  try {
    const loginRes = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
    const body = await loginRes.json();
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), body.data.token);

    const t0 = Date.now();
    await page.goto(`${BASE}/admin/proposals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const elapsed = Date.now() - t0;

    record('Trang de xuat load xong', true, `${elapsed}ms`);

    const dl4count = dl4.length;
    record('Data list 4 chi tai 1 lan (cache dung chung)', dl4count <= 1, `count=${dl4count}`);

    const gz = dl4.some(d => d.enc.includes('gzip') || d.enc.includes('br'));
    record('Data list 4 duoc nen (gzip/br)', gz, JSON.stringify(dl4[0] || {}));

    const dupView = apiCalls.filter(u => /\/api\/dynamic\/station_proposals\/view\/8/.test(u)).length;
    record('View config khong goi lap (server cache)', dupView <= 1, `view/8 calls=${dupView}`);

    const dupFieldDefs = apiCalls.filter(u => /field-definitions\/entity/.test(u)).length;
    record('Field definitions khong goi lap', dupFieldDefs <= 1, `field-defs calls=${dupFieldDefs}`);

    const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('ERR_CONNECTION_REFUSED') && !e.includes('ERR_NAME_NOT_RESOLVED'));
    record('Khong console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync('test-perf-results.json', JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
