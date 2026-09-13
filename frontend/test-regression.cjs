const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`); });

  const loginRes = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const token = (await loginRes.json()).data.token;
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);

  const pages = ['/admin', '/admin/users', '/admin/stations', '/admin/proposals', '/my-proposals', '/map'];
  for (const p of pages) {
    errors.length = 0;
    await page.goto(BASE + p);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const real = errors.filter(e => !e.includes('favicon') && !e.includes('ERR_CONNECTION_REFUSED') && !e.includes('ERR_NAME_NOT_RESOLVED'));
    console.log(`${real.length === 0 ? 'PASS' : 'FAIL'} - ${p} (errors=${real.length})${real[0] ? ' :: ' + real[0].slice(0, 120) : ''}`);
  }
  await browser.close();
}
main();
