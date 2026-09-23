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

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const r = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const tok = (await r.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), tok);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('same key')) errors.push('console: ' + m.text().slice(0, 160)); });

  const CHAT_BTN = 'button[title="Hỏi trợ lý hướng dẫn"]';

  for (const [path, shouldShow] of [['/my-proposals', true], ['/profile', true], ['/admin', true], ['/admin/help', true], ['/huong-dan', true], ['/admin/users', true]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const btn = await page.$(CHAT_BTN);
    check(`chat button ${shouldShow ? 'shown' : 'hidden'} on ${path}`, shouldShow ? btn !== null : btn === null);
  }

  const pubCtx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const pub = await pubCtx.newPage();
  for (const p of ['/login', '/register', '/de-xuat']) {
    await pub.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
    await pub.waitForTimeout(2500);
    const url = new URL(pub.url()).pathname;
    const shown = (await pub.$(CHAT_BTN)) !== null;
    const expectHidden = p !== '/de-xuat';
    check(`chat ${expectHidden ? 'hidden' : 'shown'} on public ${p}`, shown !== expectHidden, `url=${url} shown=${shown}`);
  }
  await pubCtx.close();

  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const inGroup = await page.evaluate(() => {
    const group = document.querySelector('.map-fab-group');
    if (!group) return { found: false };
    const btns = [...group.querySelectorAll('button')];
    const idx = btns.findIndex((b) => b.getAttribute('title') === 'Hỏi trợ lý hướng dẫn');
    const stationIdx = btns.findIndex((b) => b.getAttribute('title') === 'Tạo trạm nhanh');
    return { found: idx >= 0, idx, stationIdx, first: idx === 0 };
  });
  check('chat button inside map FAB group', inGroup.found, JSON.stringify(inGroup));
  check('chat button above "Tạo trạm nhanh"', inGroup.found && inGroup.stationIdx > inGroup.idx, `chat=${inGroup.idx} station=${inGroup.stationIdx}`);
  const floatingOnMap = await page.$('button.fixed.bottom-6.right-6[title="Hỏi trợ lý hướng dẫn"]');
  check('no duplicate floating chat on /map', floatingOnMap === null);

  await page.goto(`${BASE}/my-proposals`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.click(CHAT_BTN);
  await page.waitForTimeout(500);
  await page.click('button:has-text("Làm sao để hủy một đề xuất?")');
  await page.waitForFunction(() => document.querySelectorAll('.chat-bubble').length >= 2, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('.chat-bubble .loading-dots'), null, { timeout: 90000 });
  await page.waitForTimeout(600);

  const md = await page.evaluate(() => {
    const bubble = [...document.querySelectorAll('.chat-bubble')].pop();
    return {
      strong: bubble.querySelectorAll('strong').length,
      uls: bubble.querySelectorAll('ul').length,
      ols: bubble.querySelectorAll('ol').length,
      rawStars: /\*\*/.test(bubble.innerText),
      rawHash: /^#{1,4}\s/m.test(bubble.innerText),
      sourceCards: bubble.querySelectorAll('a[href*="/huong-dan"]').length,
      thumbs: bubble.querySelectorAll('a[href*="/huong-dan"] img').length,
      provider: (bubble.querySelector('.badge') || {}).innerText || '',
    };
  });
  check('markdown bold rendered', md.strong > 0, String(md.strong));
  check('markdown lists rendered', md.uls + md.ols > 0, `ul=${md.uls} ol=${md.ols}`);
  check('no raw ** left', md.rawStars === false);
  check('no raw ## left', md.rawHash === false);
  check('source cards rendered', md.sourceCards > 0, String(md.sourceCards));
  check('source thumbnails rendered', md.thumbs > 0, String(md.thumbs));
  check('provider badge shown', /Gemini|OpenRouter/.test(md.provider), md.provider);

  check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
