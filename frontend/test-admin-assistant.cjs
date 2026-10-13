const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const r = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const tok = (await r.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), tok);
  let putBody = null;
  let testBody = null;
  await ctx.route('**/api/admin/assistant/config', async (route) => {
    if (route.request().method() === 'PUT') {
      putBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { providers: [
          { provider: 'gemini', enabled: true, models: ['gemini-2.5-flash'], visionModels: [], effectiveModels: ['gemini-2.5-flash'], effectiveVisionModels: [], priority: 1, keyConfigured: true },
          { provider: 'openrouter', enabled: true, models: [], visionModels: [], effectiveModels: ['x/y:free'], effectiveVisionModels: [], priority: 2, keyConfigured: false },
        ] }, message: 'Đã lưu' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { providers: [
          { provider: 'gemini', enabled: true, models: [], visionModels: [], effectiveModels: ['gemini-3.5-flash-lite'], effectiveVisionModels: [], priority: 1, keyConfigured: true },
          { provider: 'openrouter', enabled: true, models: [], visionModels: [], effectiveModels: ['x/y:free'], effectiveVisionModels: [], priority: 2, keyConfigured: false },
        ] } }),
      });
    }
  });
  await ctx.route('**/api/admin/assistant/test', async (route) => {
    testBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { answer: 'Trạm là **cơ sở** đã có thật.', sources: [{ slug: 's03' }], provider: 'gemini', model: 'm', latencyMs: 1200, fallbackReason: null } }),
    });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('.tab')].some((t) => t.textContent.includes('Trợ lý AI')), null, { timeout: 30000 });
  await page.click('.tab:has-text("Trợ lý AI")');
  await page.waitForTimeout(800);

  const cards = await page.evaluate(() => document.body.innerText);
  check('hien 2 provider', cards.includes('Gemini') && cards.includes('OpenRouter'));
  check('badge key', cards.includes('Đã có key') && cards.includes('Chưa có key'));
  check('dong fallback', cards.includes('Gemini (chính) → OpenRouter (dự phòng)'), cards.slice(cards.indexOf('fallback'), cards.indexOf('fallback') + 60));

  await page.fill('textarea', 'gemini-2.5-flash');
  await page.click('button:has-text("Lưu cấu hình")');
  await page.waitForTimeout(800);
  check('luu gui PUT dung', !!putBody && putBody.providers.some((p) => p.provider === 'gemini' && p.models.includes('gemini-2.5-flash')), JSON.stringify(putBody && putBody.providers));
  check('toast da luu', (await page.evaluate(() => document.body.innerText)).includes('Đã lưu'));

  await page.fill('input[placeholder="Nhập câu hỏi thử..."]', 'Tram la gi?');
  await page.selectOption('select:has(option[value="gemini"])', 'gemini');
  await page.click('button:has-text("Hỏi thử")');
  await page.waitForFunction(() => document.body.innerText.includes('cơ sở'), null, { timeout: 15000 });
  check('test gui provider', !!testBody && testBody.provider === 'gemini', JSON.stringify(testBody));
  const body = await page.evaluate(() => document.body.innerText);
  check('hien badge provider + latency', body.includes('gemini') && body.includes('1200ms'));
  check('markdown cau tra loi', (await page.evaluate(() => document.querySelectorAll('.card strong').length)) > 0);

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
