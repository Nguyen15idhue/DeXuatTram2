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

  const superCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const r1 = await superCtx.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const superTok = (await r1.json()).data.token;
  await superCtx.addInitScript((t) => localStorage.setItem('token', t), superTok);
  const page = await superCtx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('same key')) errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(`${BASE}/admin/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Quản lý Hướng dẫn'), null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  check('SUPER opens /admin/help', true);
  const rows = await page.$$('tbody tr');
  check('table view has rows (page 1 = 10)', rows.length === 10, String(rows.length));
  const pageInfo = await page.$('.pagination-info');
  const pageText = pageInfo ? await pageInfo.innerText() : '';
  check('pagination shown with total', /Trang 1 \/ \d+ \(Tổng: \d+\)/.test(pageText), pageText);
  const nextBtn = await page.$('.pagination button:has-text("Sau")');
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForTimeout(600);
    const page2 = await page.$eval('.pagination-info', (el) => el.innerText);
    check('next page works', /Trang 2 \//.test(page2), page2);
    await page.click('.pagination button:has-text("Trước")');
    await page.waitForTimeout(400);
  }

  await page.click('button:has-text("Hướng dẫn")');
  await page.waitForTimeout(900);
  const boardToc = await page.$('text=Mục lục');
  check('guide view shows TOC', boardToc !== null);
  const addInCategory = await page.$('button:has-text("Thêm bài vào mục này")');
  check('guide view has per-category add button', addInCategory !== null);
  const inlineCards = await page.$$('.card .card-body h3');
  check('guide view renders article cards', inlineCards.length > 0, String(inlineCards.length));
  const inlineEdit = await page.$('.card button:has-text("Sửa")');
  check('guide view has inline edit button', inlineEdit !== null);
  const inlineStatus = await page.$('.card button:has-text("Xuất bản"), .card button:has-text("Lưu trữ")');
  check('guide view has inline status button', inlineStatus !== null);
  await page.click('button:has-text("Bảng")');
  await page.waitForTimeout(600);

  await page.click('button:has-text("Thêm bài")');
  await page.waitForTimeout(800);
  const modal = await page.$('text=Thêm bài hướng dẫn');
  check('editor modal opens', modal !== null);
  const prose = await page.$('.ProseMirror');
  check('tiptap editor mounted', prose !== null);

  const titleInput = await page.$('input[placeholder="Tiêu đề bài viết"]');
  await titleInput.fill('Bài test quy trình 53');
  await page.waitForTimeout(300);
  const slugVal = await page.$eval('input[placeholder="slug"]', (el) => el.value);
  check('slug auto-generated', slugVal === 'bai-test-quy-trinh-53', slugVal);

  await prose.click();
  await prose.type('Nội dung kiểm thử tự động.');
  const h2 = await page.$('button[title="Tiêu đề H2"]');
  await h2.click();
  await prose.type('Quy trình kiểm thử');

  await page.click('button:has-text("Lưu nháp")');
  await page.waitForTimeout(2500);
  const modalGone = await page.$('text=Thêm bài hướng dẫn');
  check('modal closed after save', modalGone === null);

  const listRes = await page.request.get(`${API}/api/admin/help/articles?q=quy%20trinh%2053`, { headers: { Authorization: `Bearer ${superTok}` } });
  const listBody = await listRes.json();
  const created = listBody.data[0];
  check('article created in DB', !!created, created ? created.status : '');
  check('created as draft (save nhaps)', created && created.status === 'draft');

  const viewerCtx = await browser.newContext();
  await viewerCtx.addInitScript((t) => localStorage.setItem('token', t), superTok);
  const viewer = await viewerCtx.newPage();
  await viewer.goto(`${BASE}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await viewer.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 30000 });
  await viewer.waitForTimeout(800);
  const draftVisible = await viewer.$(`#help-${created ? created.slug : 'none'}`);
  check('draft hidden in viewer', draftVisible === null);
  await viewerCtx.close();

  await page.request.post(`${API}/api/admin/help/articles/${created.id}/publish`, { headers: { Authorization: `Bearer ${superTok}` } });

  const viewerCtx2 = await browser.newContext();
  await viewerCtx2.addInitScript((t) => localStorage.setItem('token', t), superTok);
  const viewer2 = await viewerCtx2.newPage();
  await viewer2.goto(`${BASE}/huong-dan#${created.slug}`, { waitUntil: 'domcontentloaded' });
  await viewer2.waitForFunction((s) => !!document.getElementById(`help-${s}`), created.slug, { timeout: 30000 });
  await viewer2.waitForTimeout(800);
  const publishedVisible = await viewer2.$(`#help-${created.slug}`);
  const hasH2 = await viewer2.$(`#help-${created.slug} h2`);
  check('published article visible in viewer', publishedVisible !== null);
  check('H2 rendered from content_json', hasH2 !== null);
  await viewerCtx2.close();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Quản lý Hướng dẫn'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const delRow = await page.$(`tr:has-text("bai-test-quy-trinh-53") button[title="Xóa"]`);
  check('delete button present for row', delRow !== null);
  if (delRow) {
    await delRow.click();
    await page.waitForTimeout(600);
    const confirmVisible = await page.$('text=Xóa bài hướng dẫn');
    check('delete confirm dialog shown', confirmVisible !== null);
    await page.click('.confirm-dialog button:has-text("Xóa")');
    await page.waitForTimeout(2500);
    const after = await page.request.get(`${API}/api/admin/help/articles?q=quy%20trinh%2053`, { headers: { Authorization: `Bearer ${superTok}` } });
    const afterBody = await after.json();
    check('article deleted', afterBody.data.length === 0, String(afterBody.data.length));
  }
  await superCtx.close();

  const adminCtx = await browser.newContext();
  const r2 = await adminCtx.request.post(`${API}/api/auth/login`, { data: { email: 'tonggiamdoc-egreen@tmt-vietnam.com', password: '123456' } });
  const adminTok = (await r2.json()).data.token;
  await adminCtx.addInitScript((t) => localStorage.setItem('token', t), adminTok);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/admin/help`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(3500);
  const blocked = !adminPage.url().includes('/admin/help') || !(await adminPage.$('text=Quản lý Hướng dẫn'));
  check('ADMIN blocked from /admin/help', blocked, adminPage.url());
  await adminCtx.close();

  check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
