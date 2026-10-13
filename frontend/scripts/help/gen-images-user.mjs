import { chromium } from 'playwright';
import { login, goto, BASE, createRunner } from './shared.mjs';
import { annotate, clearMarks } from './annotate.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 768 } });
const page = await ctx.newPage();
const R = createRunner({ laneId: 'A', imageDir: 'user' });

const closeDropdown = async () => { await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(5, 5).catch(() => {}); };

// --- Khách (chưa đăng nhập) ---
await R.run('A01', 'Đăng nhập', async () => {
  await goto(page, '/login', 900);
  await annotate(page, [{ selector: 'button[type="submit"]', shape: 'box', label: '1', arrow: 'left' }]);
  await R.shot(page, 'a01_dang-nhap.jpg');
  await clearMarks(page);
});

await R.run('A02', 'Đăng ký', async () => {
  await goto(page, '/register', 900);
  await R.shot(page, 'a02_dang-ky.jpg');
  await clearMarks(page);
});

// --- Đăng nhập ---
await login(page);

await R.run('A13', 'Guest đề xuất', async () => {
  await goto(page, '/de-xuat', 1800);
  await R.shot(page, 'a13-guest.jpg');
  await clearMarks(page);
});

await R.run('A03', 'Hồ sơ cá nhân', async () => {
  await goto(page, '/profile', 1200);
  await R.shot(page, 'a03_ho-so.jpg');
  await clearMarks(page);
});

await R.run('A04', 'Bản đồ marker & chú thích', async () => {
  await goto(page, '/map', 3500);
  await annotate(page, [{ selector: '.map-legend', shape: 'box', label: '1' }]);
  await R.shot(page, 'a04-ban-do.jpg');
  await clearMarks(page);
});

await R.run('A05', 'Bộ lọc bản đồ', async () => {
  await goto(page, '/map', 3000);
  await page.getByText('Bộ lọc bản đồ', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await annotate(page, [{ selector: '.map-filter', shape: 'box', label: '1' }]);
  await R.shot(page, 'a05-bo-loc.jpg');
  await clearMarks(page);
});

await R.run('A06', 'Chuyển nền bản đồ', async () => {
  await goto(page, '/map', 3000);
  await page.locator('button[title="Chuyển layer"]').click().catch(() => {});
  await page.waitForTimeout(500);
  await annotate(page, [{ selector: '.map-layer-group-title', shape: 'box', label: '1' }]);
  await R.shot(page, 'a06-chuyen-layer.jpg');
  await clearMarks(page);
});

await R.run('A07', 'Nhãn hành chính mới/cũ', async () => {
  await page.waitForTimeout(300);
  await annotate(page, [
    { text: 'Nhãn hành chính', shape: 'box', label: '1' },
    { text: 'Nhãn mới', shape: 'circle', label: '2' },
    { text: 'Nhãn cũ', shape: 'circle', label: '3' },
  ]);
  await R.shot(page, 'a07-nhan-hanh-chinh.jpg');
  await clearMarks(page);
  await closeDropdown();
});

await R.run('A08', 'Bật/tắt 3D', async () => {
  await goto(page, '/map', 3000);
  await page.locator('button[title*="3D"]').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await annotate(page, [{ selector: 'button[title*="3D"]', shape: 'circle', label: '1', arrow: 'bottom' }]);
  await R.shot(page, 'a08-3d.jpg');
  await clearMarks(page);
});

await R.run('A09', 'Menu tạo đề xuất', async () => {
  await goto(page, '/map', 3000);
  await page.locator('button[title="Tạo đề xuất mới"]').click().catch(() => {});
  await page.waitForTimeout(600);
  await annotate(page, [
    { selector: '.map-create-title', shape: 'box', label: '1' },
    { text: 'Vị trí của tôi', shape: 'box', label: '2' },
    { text: 'Chọn trên bản đồ', shape: 'box', label: '3' },
    { text: 'Dán link Google Map...', shape: 'box', label: '4' },
  ]);
  await R.shot(page, 'a09-menu-tao-de-xuat.jpg');
  await clearMarks(page);
});

await R.run('A10', 'Form đề xuất', async () => {
  await page.getByText('Chọn trên bản đồ', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const box = await page.locator('.maplibregl-canvas, .leaflet-container').first().boundingBox().catch(() => null);
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Xác nhận' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await R.shot(page, 'a10-form-de-xuat.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
});

await R.run('A11', 'Tạo trạm nhanh', async () => {
  await goto(page, '/map', 3000);
  await annotate(page, [{ selector: 'button[title="Tạo trạm nhanh"]', shape: 'circle', label: '1', arrow: 'left' }]);
  await R.shot(page, 'a11-tao-tram-nhanh.jpg');
  await clearMarks(page);
});

await R.run('A12', 'Đề xuất của tôi', async () => {
  await goto(page, '/my-proposals', 1800);
  await R.shot(page, 'a12-de-xuat-cua-toi.jpg');
  await clearMarks(page);
});

await R.run('A14', 'Thông báo', async () => {
  await goto(page, '/map', 2500);
  await page.locator('button[title*="hông báo"], button[aria-label*="hông báo"]').first().click()
    .catch(async () => { await page.locator('header button').last().click().catch(() => {}); });
  await page.waitForTimeout(700);
  await R.shot(page, 'a14-thong-bao.jpg');
  await clearMarks(page);
});

R.finish();
await browser.close();
