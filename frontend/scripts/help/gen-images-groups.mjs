import { chromium } from 'playwright';
import { login, goto, createRunner } from './shared.mjs';
import { annotate, clearMarks } from './annotate.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 768 } });
const page = await ctx.newPage();
const R = createRunner({ laneId: 'G', imageDir: 'user' });

await login(page);

await R.run('G03', 'Dang xuat', async () => {
  await goto(page, '/map', 2500);
  await annotate(page, [{ selector: 'button[title="Đăng xuất"]', shape: 'box', label: '1', arrow: 'left' }]);
  await R.shot(page, 'g03_dang-xuat.jpg');
  await clearMarks(page);
});

await R.run('G05', 'Doi mat khau', async () => {
  await goto(page, '/profile', 1500);
  await annotate(page, [{ text: 'mật khẩu', shape: 'box', label: '1' }]);
  await R.shot(page, 'g05_doi-mat-khau.jpg');
  await clearMarks(page);
});

await R.run('G11', 'Ban do lan can', async () => {
  await goto(page, '/my-proposals', 1800);
  await page.locator('tbody tr').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByText('Xem bản đồ', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await R.shot(page, 'g11_ban-do-lan-can.jpg');
  await clearMarks(page);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape').catch(() => {});
});

await R.run('G15', 'Xoa de xuat (khong xac nhan)', async () => {
  await goto(page, '/my-proposals', 1800);
  await page.getByRole('button', { name: 'Xóa' }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await annotate(page, [{ text: 'Xóa đề xuất', shape: 'box', label: '1' }]);
  await R.shot(page, 'g15_xoa-de-xuat.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
  await page.waitForTimeout(400);
});

await R.run('G18', 'Tra cuu tracking', async () => {
  await goto(page, '/de-xuat', 1800);
  await annotate(page, [{ text: 'tra cứu', shape: 'box', label: '1' }]);
  await R.shot(page, 'g18_tra-cuu-tracking.jpg');
  await clearMarks(page);
});

await R.run('F13', 'Tao de xuat tu my-proposals', async () => {
  await goto(page, '/my-proposals', 1800);
  await page.getByRole('button', { name: 'Tạo đề xuất' }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await R.shot(page, 'f13_tao-tu-my-proposals.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
});

await R.run('F43', 'O ID 1Office', async () => {
  await goto(page, '/admin/proposals', 2000);
  await annotate(page, [
    { text: 'Mã contact 1Office', shape: 'box', label: '1' },
    { text: 'Đẩy sang 1Office', shape: 'box', label: '2' },
  ]);
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { dirname } = await import('node:path');
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'help', 'admin-data');
  await import('node:fs').then((fs) => fs.mkdirSync(outDir, { recursive: true }));
  await page.screenshot({ path: join(outDir, 'f43_id-1office.jpg'), type: 'jpeg', quality: 82 });
  await clearMarks(page);
});

R.finish();
await browser.close();
