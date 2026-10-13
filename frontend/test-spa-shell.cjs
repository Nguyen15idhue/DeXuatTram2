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
  const page = await ctx.newPage();

  let docRequests = 0;
  page.on('request', (req) => { if (req.resourceType() === 'document') docRequests += 1; });

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const baseDocs = docRequests;

  const headerSel = 'aside, .drawer-side';

  const links = [
    ['Quản lý Users', '/admin/users'],
    ['Quản lý Đề xuất', '/admin/proposals'],
    ['Quản lý Hướng dẫn', '/admin/help'],
    ['Dashboard', '/admin'],
  ];
  let headerStable = true;
  for (const [label, expectPath] of links) {
    const link = await page.$(`a:has-text("${label}")`);
    if (!link) { check(`link "${label}" present`, false); continue; }
    // capture the sidebar node identity before navigating
    const before = await page.evaluate(() => {
      const el = document.querySelector('.drawer-side');
      if (!el) return null;
      window.__sidebarRef = el;
      return true;
    });
    await link.click();
    // during lazy chunk load, sidebar must still exist
    await page.waitForTimeout(120);
    const duringExists = await page.$('.drawer-side');
    await page.waitForTimeout(2200);
    const sameNode = await page.evaluate(() => {
      const el = document.querySelector('.drawer-side');
      return el === window.__sidebarRef;
    });
    const path = new URL(page.url()).pathname;
    if (!before || !duringExists || !sameNode) headerStable = false;
    check(`navigate ${expectPath}, sidebar stays mounted`, path === expectPath && duringExists !== null && sameNode, `url=${path} during=${!!duringExists} same=${sameNode}`);
  }

  check('no document reload during navigation', docRequests - baseDocs === 0, `docRequests=${docRequests - baseDocs}`);
  check('sidebar never unmounted', headerStable);
  await ctx.close();

  const uctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const ur = await uctx.request.post(`${API}/api/auth/login`, { data: { email: 'user2@example.com', password: '123456' } });
  const utok = (await ur.json()).data.token;
  await uctx.addInitScript((t) => localStorage.setItem('token', t), utok);
  const upage = await uctx.newPage();
  let udocs = 0;
  upage.on('request', (req) => { if (req.resourceType() === 'document') udocs += 1; });
  await upage.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' });
  await upage.waitForTimeout(5000);
  const ub = udocs;
  const ulinks = [['Đề xuất của tôi', '/my-proposals'], ['Hồ sơ', '/profile'], ['Hướng dẫn', '/huong-dan'], ['Bản đồ', '/map']];
  let userHeaderStable = true;
  for (const [label, expect] of ulinks) {
    await upage.evaluate(() => { window.__hdr = document.querySelector('header'); });
    const link = await upage.$(`header a:has-text("${label}")`);
    if (!link) { check(`user link "${label}"`, false); continue; }
    await link.click();
    await upage.waitForTimeout(120);
    const during = await upage.$('header');
    await upage.waitForTimeout(2000);
    const same = await upage.evaluate(() => document.querySelector('header') === window.__hdr);
    const path = new URL(upage.url()).pathname;
    if (!during || !same) userHeaderStable = false;
    check(`user nav ${expect}, header stays mounted`, path === expect && !!during && same, `url=${path} during=${!!during} same=${same}`);
  }
  check('user layout no document reload', udocs - ub === 0, `docRequests=${udocs - ub}`);
  check('user header never unmounted', userHeaderStable);
  await uctx.close();

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
