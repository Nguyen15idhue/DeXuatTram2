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
  await ctx.route('**/api/admin/assistant/config', async (route) => {
    if (route.request().method() === 'PUT') {
      putBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { providers: [] }, message: 'Đã lưu' }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { providers: [
        { provider: 'gemini', enabled: true, models: [], visionModels: [], effectiveModels: ['gemini-2.5-flash'], effectiveVisionModels: [], priority: 1, keyConfigured: true },
        { provider: 'openrouter', enabled: true, models: [], visionModels: [], effectiveModels: ['x/y:free'], effectiveVisionModels: [], priority: 2, keyConfigured: true },
      ] } }) });
    }
  });
  await ctx.route('**/api/admin/assistant/models?provider=openrouter', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { provider: 'openrouter', cached: false, models: [
      { id: 'qwen/qwen3-free', name: 'Qwen3 Free', free: true, context: 1000 },
      { id: 'paid/pro-model', name: 'Pro Model', free: false, context: 200000 },
    ] } }) });
  });
  await ctx.route('**/api/admin/assistant/models?provider=gemini*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { provider: 'gemini', cached: false, models: [{ id: 'gemini-2.5-flash', name: 'Gemini Flash' }] } }) });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('.tab')].some((t) => t.textContent.includes('Trợ lý AI')), null, { timeout: 30000 });
  await page.click('.tab:has-text("Trợ lý AI")');
  await page.waitForTimeout(1200);

  const chain = await page.evaluate(() => [...document.querySelectorAll('.drag-drop-item')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
  check('chuoi fallback 2 muc', chain.length === 2 && chain[0].includes('1') && chain[0].includes('Gemini'), chain.join(' | '));

  const boxes = await page.$$('.card .select');
  check('co o chon model', boxes.length >= 2, String(boxes.length));
  await boxes[1].click();
  await page.waitForTimeout(300);
  await page.keyboard.type('qwen');
  await page.waitForTimeout(300);
  const visible = await page.evaluate(() => [...document.querySelectorAll('.absolute')].flatMap((d) => [...d.querySelectorAll('div')]).filter((d) => d.textContent.includes('Qwen3')).length);
  check('search loc model', visible > 0, String(visible));
  await page.evaluate(() => {
    const dd = [...document.querySelectorAll('.absolute')].find((d) => d.textContent.includes('Qwen3 Free'));
    const row = dd ? [...dd.querySelectorAll('div')].find((d) => d.querySelector('input[type="checkbox"]')) : null;
    if (row) row.click();
  });
  await page.waitForTimeout(400);
  const chips = await page.evaluate(() => [...document.querySelectorAll('.badge')].some((b) => b.textContent.includes('Qwen3')));
  check('chon multi hien chip', chips);

  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.drag-drop-item')];
    const dt = new DataTransfer();
    items[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    items[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
    items[1].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  });
  await page.waitForTimeout(400);
  const chain2 = await page.evaluate(() => [...document.querySelectorAll('.drag-drop-item')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
  check('keo-tha doi fallback', chain2[0].includes('OpenRouter') && chain2[1].includes('Gemini'), chain2.join(' | '));

  await page.click('button:has-text("Lưu cấu hình")');
  await page.waitForTimeout(800);
  const pri = putBody ? Object.fromEntries(putBody.providers.map((p) => [p.provider, p.priority])) : null;
  check('luu gui priority moi', !!pri && pri.openrouter === 1 && pri.gemini === 2, JSON.stringify(pri));
  check('luu gui model da chon', !!putBody && putBody.providers.some((p) => p.provider === 'openrouter' && p.models.includes('qwen/qwen3-free')), JSON.stringify(putBody && putBody.providers));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
