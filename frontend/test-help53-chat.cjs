const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const r = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'user2@example.com', password: '123456' } });
  const tok = (await r.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), tok);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('same key')) errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(`${BASE}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const chatBtn = await page.$('button[title="Hỏi trợ lý hướng dẫn"]');
  check('chat button visible on help page', chatBtn !== null);

  if (chatBtn) {
    await chatBtn.click();
    await page.waitForTimeout(500);
    const panel = await page.$('text=Trợ lý hướng dẫn');
    check('chat panel opens', panel !== null);
    const sugg = await page.$('button:has-text("Làm sao để hủy một đề xuất?")');
    check('suggestions shown', sugg !== null);
    if (sugg) {
      await page.click('button:has-text("Làm sao để hủy một đề xuất?")');
      await page.waitForFunction(() => document.querySelectorAll('.chat-bubble').length >= 2, null, { timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('.chat-bubble .loading-dots'), null, { timeout: 90000 });
      await page.waitForTimeout(400);
      const bubbles = await page.$$('.chat-bubble');
      check('user + bot bubbles', bubbles.length >= 2, String(bubbles.length));
      const badge = await page.$('.chat-bubble .badge');
      const badgeText = badge ? await badge.innerText() : '';
      check('provider badge shown (Gemini/OpenRouter)', /Gemini|OpenRouter/.test(badgeText), badgeText);
      const srcLinks = await page.$$('a.link[href*="#"]');
      check('source links rendered', srcLinks.length > 0, String(srcLinks.length));
    }
  }

  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const mapBtn = await page.$('button[title="Hỏi trợ lý hướng dẫn"]');
  check('chat button visible on /map', mapBtn !== null);
  await ctx.close();

  const offCtx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  await offCtx.addInitScript((t) => localStorage.setItem('token', t), tok);
  await offCtx.route('**/api/assistant/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) }));
  const offPage = await offCtx.newPage();
  await offPage.goto(`${BASE}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await offPage.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await offPage.waitForTimeout(1000);
  const hiddenBtn = await offPage.$('button[title="Hỏi trợ lý hướng dẫn"]');
  check('chat hidden when disabled', hiddenBtn === null);
  await offCtx.close();

  const mobCtx = await browser.newContext({ viewport: { width: 375, height: 720 } });
  await mobCtx.addInitScript((t) => localStorage.setItem('token', t), tok);
  const mob = await mobCtx.newPage();
  await mob.goto(`${BASE}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await mob.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await mob.waitForTimeout(1000);
  const mobBtn = await mob.$('button[title="Hỏi trợ lý hướng dẫn"]');
  if (mobBtn) { await mobBtn.click(); await mob.waitForTimeout(600); }
  const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('mobile chat no overflow', overflow <= 1, 'overflow=' + overflow);
  await mobCtx.close();

  check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
