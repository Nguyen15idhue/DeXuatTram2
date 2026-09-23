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
  const r = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'user2@example.com', password: '123456' } });
  const tok = (await r.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), tok);
  const page = await ctx.newPage();

  const apiRes = await ctx.request.post(`${API}/api/assistant/ask`, {
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    data: { question: 'Ghi nho dang nhap 30 ngay la gi?' },
  });
  const body = await apiRes.json();
  const src = (body.data && body.data.sources || []).find((s) => s.slug === 'ghi-nho-dang-nhap-30-ngay');
  check('source has category field', !!src && !!src.category, src ? String(src.category) : 'none');
  const expectedLink = `/huong-dan?s=${src.category}#${src.slug}`;

  // 1) Open with ?s= + hash → correct section active + scrolled
  await page.goto(`${BASE}${expectedLink}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const state = await page.evaluate((slug) => {
    const el = document.getElementById(`help-${slug}`);
    const h2 = document.querySelector('main h2, h2');
    const activeToc = document.querySelector('aside button.bg-primary');
    let inView = false;
    if (el) {
      const rect = el.getBoundingClientRect();
      inView = rect.top < window.innerHeight && rect.bottom > 0;
    }
    return {
      sectionTitle: h2 ? h2.innerText.trim().split('\n')[0] : '',
      activeToc: activeToc ? activeToc.innerText.trim() : '',
      articleExists: !!el,
      inView,
      url: location.pathname + location.search + location.hash,
    };
  }, src.slug);
  check('deep-link opens correct section', state.activeToc.includes('Tài khoản') || state.sectionTitle.includes('Tài khoản'), `toc="${state.activeToc}" h2="${state.sectionTitle}"`);
  check('deep-link article exists', state.articleExists);
  check('deep-link scrolled into view', state.inView, `url=${state.url}`);

  // 2) Same-page navigation via chat source card (React Router Link) → switches section + scrolls
  await page.goto(`${BASE}/huong-dan?s=ban-do`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const beforeDocs = await page.evaluate(() => document.querySelectorAll('.card').length);
  await page.click('button[title="Hỏi trợ lý hướng dẫn"]');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Đăng nhập bằng email hay số điện thoại?")');
  await page.waitForFunction(() => !document.querySelector('.chat-bubble .loading-dots') && document.querySelectorAll('.chat-bubble').length >= 2, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  const card = await page.$(`.chat-bubble a[href*="#ghi-nho-dang-nhap-30-ngay"]`);
  check('chat source card present', card !== null);
  await card.click();
  await page.waitForTimeout(2500);
  const after = await page.evaluate((slug) => {
    const el = document.getElementById(`help-${slug}`);
    const activeToc = document.querySelector('aside button.bg-primary');
    let inView = false;
    if (el) { const rect = el.getBoundingClientRect(); inView = rect.top < window.innerHeight && rect.bottom > 0; }
    return { url: location.pathname + location.search + location.hash, activeToc: activeToc ? activeToc.innerText.trim() : '', inView, exists: !!el, cards: document.querySelectorAll('.card').length };
  }, src.slug);
  check('same-page nav URL has ?s= + hash', after.url.includes('?s=tai-khoan') && after.url.includes('#ghi-nho-dang-nhap-30-ngay'), after.url);
  check('same-page nav switches section', after.activeToc.includes('Tài khoản'), `toc="${after.activeToc}"`);
  check('same-page nav scrolls to article', after.exists && after.inView);

  // 3) all chat source links carry ?s= + hash
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('.chat-bubble a[href*="/huong-dan"]')].map((a) => a.getAttribute('href')));
  check('chat source links include ?s=', hrefs.length > 0 && hrefs.every((h) => h.includes('?s=') && h.includes('#')), hrefs.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
