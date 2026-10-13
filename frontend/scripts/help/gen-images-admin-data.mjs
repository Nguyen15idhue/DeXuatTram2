import { chromium } from 'playwright';
import { login, goto, createRunner } from './shared.mjs';
import { annotate, clearMarks } from './annotate.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 768 } });
const page = await ctx.newPage();
const R = createRunner({ laneId: 'B', imageDir: 'admin-data' });

await login(page);

await R.run('B01', 'Dashboard', async () => {
  await goto(page, '/admin', 1500);
  await R.shot(page, 'b01_dashboard.jpg');
  await clearMarks(page);
});

await R.run('B02', 'Users danh sách', async () => {
  await goto(page, '/admin/users', 1800);
  await R.shot(page, 'b02_users.jpg');
  await clearMarks(page);
});

await R.run('B03', 'Users tạo', async () => {
  await page.getByRole('button', { name: 'Tạo user' }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await annotate(page, [{ selector: 'dialog .modal-box', shape: 'box', label: '1' }]);
  await R.shot(page, 'b03_tao-user.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
});

await R.run('B04', 'Users Import/Export', async () => {
  await goto(page, '/admin/users', 1800);
  await annotate(page, [
    { text: 'Template', shape: 'box', label: '1' },
    { text: 'Export', shape: 'box', label: '2' },
    { text: 'Import', shape: 'box', label: '3' },
  ]);
  await R.shot(page, 'b04_import-export.jpg');
  await clearMarks(page);
});

await R.run('B05', 'Stations danh sách', async () => {
  await goto(page, '/admin/stations', 1800);
  await R.shot(page, 'b05_stations.jpg');
  await clearMarks(page);
});

await R.run('B06', 'Stations thêm', async () => {
  await page.getByRole('button', { name: 'Thêm trạm' }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await annotate(page, [{ selector: 'dialog .modal-box', shape: 'box', label: '1' }]);
  await R.shot(page, 'b06-them-tram.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
});

await R.run('B07', 'Proposals danh sách', async () => {
  await goto(page, '/admin/proposals', 2000);
  await R.shot(page, 'b07_proposals.jpg');
  await clearMarks(page);
});

await R.run('B08', 'Proposals trạng thái', async () => {
  await annotate(page, [{ selector: 'select', shape: 'box', label: '1', arrow: 'left' }]);
  await R.shot(page, 'b08_trang-thai.jpg');
  await clearMarks(page);
});

await R.run('B09', 'Proposals 1Office', async () => {
  await goto(page, '/admin/proposals', 2000);
  const first = page.locator('table tbody tr').first();
  await first.locator('button').last().click().catch(() => {});
  await page.waitForTimeout(700);
  await R.shot(page, 'b09_1office.jpg');
  await clearMarks(page);
});

await R.run('B10', 'Audit log', async () => {
  await goto(page, '/admin/audit-log', 1800);
  await R.shot(page, 'b10_audit.jpg');
  await clearMarks(page);
});

await R.run('B11', 'Chi tiết bản ghi (file)', async () => {
  await goto(page, '/admin/proposals', 2000);
  await page.getByRole('button', { name: 'Xem', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await R.shot(page, 'b11_files.jpg');
  await clearMarks(page);
});

R.finish();
await browser.close();
