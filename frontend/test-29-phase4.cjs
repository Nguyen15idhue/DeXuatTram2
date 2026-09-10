const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const CONFIG_ID = 3;
const ketQua = [];
const ghi = (ten, ok, chiTiet = '') => {
  ketQua.push({ ten, ok, chiTiet });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${ten}${chiTiet ? ' - ' + chiTiet : ''}`);
};

async function main() {
  const token = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' })
  }).then(r => r.json()).then(j => j.data?.token);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const loiConsole = [];
  page.on('pageerror', e => loiConsole.push(String(e).slice(0, 120)));

  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/admin/api-configs`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const nutMapping = page.locator('button:has-text("Mapping")').first();
  await nutMapping.click();
  await page.waitForTimeout(2500);

  let noiDung = await page.locator('body').innerText();
  ghi('Panel mở, có 2 cột', noiDung.includes('Proposal Fields (Nguồn)') && noiDung.includes('Contact Fields (1Office)'));
  ghi('Có khối Đã link', /đã link/i.test(noiDung));
  ghi('Có mục desc cố định', noiDung.includes('Mô tả (Desc Template)'));
  ghi('Có mục files cố định', noiDung.includes('Tệp đính kèm (files)'));

  if (await page.locator('[data-field-key="owner_name"]').count() === 0) {
    await page.locator('button:has-text("Get")').first().click();
    await page.waitForTimeout(2500);
  }
  ghi('Có Proposal Fields để kéo', await page.locator('[data-field-key="owner_name"]').count() > 0);

  const badgeTruoc = parseInt((await page.locator('[data-count-key="owner_name"]').innerText().catch(() => '0')).replace(/[^0-9]/g, '') || '0', 10);
  ghi('owner_name có badge ban đầu', badgeTruoc >= 1, `badge=${badgeTruoc}`);

  const targetChuaLink = 'formal_name';
  await page.locator(`[data-field-key="owner_name"]`).dragTo(page.locator(`[data-target-key="${targetChuaLink}"]`));
  await page.waitForTimeout(2000);
  ghi('Kéo owner_name vào formal_name -> xuất hiện khối Đã link', await page.locator(`[data-linked-key="${targetChuaLink}"]`).count() > 0);
  const badgeSau = parseInt((await page.locator('[data-count-key="owner_name"]').innerText().catch(() => '0')).replace(/[^0-9]/g, '') || '0', 10);
  ghi('Badge owner_name tăng lên', badgeSau === badgeTruoc + 1, `${badgeTruoc} -> ${badgeSau}`);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("Mapping")').first().click();
  await page.waitForTimeout(2500);
  ghi('Mapping lưu server (reload vẫn còn)', await page.locator(`[data-linked-key="${targetChuaLink}"]`).count() > 0);

  await page.locator(`[data-field-key="address"]`).dragTo(page.locator(`[data-linked-key="${targetChuaLink}"]`));
  await page.waitForTimeout(2000);
  let chuoiLink = await page.locator(`[data-linked-key="${targetChuaLink}"]`).innerText();
  ghi('Thả source khác vào target đã link -> thay thế', chuoiLink.includes('address'), chuoiLink.replace(/\n/g, ' ').slice(0, 80));

  const soTruocXoa = await page.locator(`[data-linked-key="${targetChuaLink}"]`).count();
  await page.locator(`[data-unlink="${targetChuaLink}"]`).click();
  await page.waitForTimeout(2000);
  ghi('X -> unlink', soTruocXoa === 1 && await page.locator(`[data-linked-key="${targetChuaLink}"]`).count() === 0);

  const unsupported = page.locator('[data-target-key="gender"]');
  if (await unsupported.count() > 0) {
    const co = await unsupported.getAttribute('data-unsupported');
    ghi('Field unsupported được đánh dấu khóa', co === '1');
  } else {
    ghi('Field unsupported hiển thị', false, 'không tìm thấy gender');
  }

  ghi('Không lỗi console', loiConsole.length === 0, loiConsole.join(' | ').slice(0, 150));

  await browser.close();
  const thatBai = ketQua.filter(x => !x.ok);
  console.log(`\nTỔNG ${ketQua.length}, THẤT BẠI ${thatBai.length}`);
  require('fs').writeFileSync('test-29-phase4-results.json', JSON.stringify(ketQua, null, 2));
  process.exit(thatBai.length ? 1 : 0);
}

main().catch(e => { console.error('LỖI', e); process.exit(1); });
