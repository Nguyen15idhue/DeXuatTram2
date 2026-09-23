const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const tmp = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'user2@example.com', password: '123456' } });
  const tok = (await tmp.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), tok);
  await ctx.route('**/api/help/**', (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(`${BASE}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const banner = await page.$('text=đang hiển thị bản hướng dẫn kèm sẵn');
  const legacy = await page.$('#S01');
  console.log('offline_banner=' + (banner !== null));
  console.log('legacy_S01=' + (legacy !== null));
  await browser.close();
  if (!banner || !legacy) process.exit(1);
}
main();
