const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const r = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'user2@example.com', password: '123456' } });
  const tok = (await r.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), tok);
  await ctx.route('**/api/assistant/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { enabled: true } }),
  }));
  const captured = {};
  await ctx.route('**/api/assistant/ask-stream', async (route) => {
    captured.ct = route.request().headers()['content-type'] || '';
    const sse = 'event: status\ndata: {"stage":"think","message":"Dang tong hop"}\n\nevent: delta\ndata: {"text":"Da nhan tep"}\n\nevent: done\ndata: {"sources":[],"provider":"gemini","model":"m","cached":false,"fallbackReason":null}\n\n';
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my-proposals`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('button[title="Hỏi trợ lý hướng dẫn"]'), null, { timeout: 30000 });
  await page.click('button[title="Hỏi trợ lý hướng dẫn"]');
  await page.waitForTimeout(500);

  const attachBtn = await page.$('button[title*="Đính kèm"]');
  check('nut dinh kem hien', !!attachBtn, attachBtn ? await attachBtn.getAttribute('title') : '');

  await page.setInputFiles('.p-3.border-t input[type="file"]', [{ name: 'anh.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForTimeout(400);
  const chip = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.p-3.border-t span')].find((s) => s.textContent.includes('anh.png'));
    return !!el;
  });
  check('preview chip sau khi chon anh', chip);

  const big = Buffer.alloc(6 * 1024 * 1024, 1);
  await page.setInputFiles('.p-3.border-t input[type="file"]', [{ name: 'big.png', mimeType: 'image/png', buffer: big }]);
  await page.waitForTimeout(400);
  const err = await page.evaluate(() => {
    const el = document.querySelector('.p-3.border-t .text-error');
    return el ? el.textContent : '';
  });
  check('chan file qua 5MB', err.includes('5MB'), err);

  await page.fill('input[placeholder="Nhập câu hỏi..."]', 'Anh nay noi gi?');
  await page.click('.p-3.border-t button.btn-primary');
  await page.waitForFunction(() => [...document.querySelectorAll('.chat-bubble')].some((b) => b.textContent.includes('Da nhan tep')), null, { timeout: 30000 });
  check('gui multipart khi co file', (captured.ct || '').includes('multipart/form-data'), captured.ct);
  const bubble = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.chat.chat-end .chat-bubble')].pop();
    return b ? b.textContent : '';
  });
  check('bubble hien ten file', bubble.includes('anh.png'), bubble.slice(0, 80));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
