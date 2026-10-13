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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tmp = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'user2@example.com', password: '123456' } });
  const ctvTok = (await tmp.json()).data.token;
  const tmp2 = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const superTok = (await tmp2.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), ctvTok);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('same key')) errors.push('console: ' + m.text().slice(0, 160));
  });

  await page.goto(`${BASE}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(800);

  check('api-mode article renders', await page.$('text=Để làm gì:') !== null);
  check('no offline banner when API up', await page.$('text=đang hiển thị bản hướng dẫn kèm sẵn') === null);
  const cards = await page.$$('.card');
  check('article cards count>=4', cards.length >= 4, String(cards.length));

  await page.goto(`${BASE}/huong-dan#G39`);
  await page.waitForSelector('#help-g39-de-xuat-mo-hinh-nq-lk-tab-long', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const g39 = await page.$('#help-g39-de-xuat-mo-hinh-nq-lk-tab-long');
  check('deep-link legacy #G39 scrolls', g39 !== null && await g39.isVisible());

  await page.goto(`${BASE}/huong-dan#s01-he-thong-nay-de-lam-gi`);
  await page.waitForSelector('#help-s01-he-thong-nay-de-lam-gi', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const s01 = await page.$('#help-s01-he-thong-nay-de-lam-gi');
  check('deep-link #slug scrolls', s01 !== null && await s01.isVisible());

  const search = await page.$('input[placeholder*="Tìm bước"]');
  await search.fill('hủy');
  await page.waitForTimeout(800);
  const marks = await page.$$('mark');
  check('search highlight <mark>', marks.length > 0, String(marks.length));
  await search.fill('');

  const catsRes = await page.request.get(`${API}/api/help/categories`, { headers: { Authorization: `Bearer ${superTok}` } });
  const catsBody = await catsRes.json();
  const catBando = catsBody.data.find((c) => c.slug === 'de-xuat-cua-toi').id;
  const yt = await page.request.post(`${API}/api/admin/help/articles`, {
    headers: { Authorization: `Bearer ${superTok}` },
    data: { title: 'Test video YouTube 53', status: 'published', roles: ['CTV'], category_id: catBando, videos: [{ type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'demo yt' }] },
  });
  const ytBody = await yt.json();
  const ytSlug = ytBody.data.slug;
  const ytCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ytCtx.addInitScript((t) => localStorage.setItem('token', t), ctvTok);
  const ytPage = await ytCtx.newPage();
  await ytPage.goto(`${BASE}/huong-dan#${ytSlug}`, { waitUntil: 'domcontentloaded' });
  await ytPage.waitForFunction((slug) => !!document.getElementById(`help-${slug}`), ytSlug, { timeout: 30000 });
  await ytPage.waitForTimeout(800);
  const thumb = await ytPage.$(`#help-${ytSlug} img[src*="i.ytimg.com"]`);
  check('youtube lazy thumbnail shown', thumb !== null);
  const iframeBefore = await ytPage.$(`#help-${ytSlug} iframe`);
  check('no iframe before click', iframeBefore === null);
  if (thumb) {
    await thumb.click();
    await ytPage.waitForTimeout(800);
    const iframeAfter = await ytPage.$(`#help-${ytSlug} iframe[src*="youtube-nocookie"]`);
    check('iframe loads after click', iframeAfter !== null);
  }
  await ytCtx.close();
  await page.request.delete(`${API}/api/admin/help/articles/${ytBody.data.id}`, { headers: { Authorization: `Bearer ${superTok}` } });

  const mobCtx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await mobCtx.addInitScript((t) => localStorage.setItem('token', t), ctvTok);
  const mob = await mobCtx.newPage();
  await mob.goto(`${BASE}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await mob.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await mob.waitForTimeout(800);
  const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('mobile 375 no overflow', overflow <= 1, 'overflow=' + overflow);
  await mobCtx.close();

  check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
