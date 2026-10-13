import { chromium } from 'playwright';
import { login, goto, createRunner } from './shared.mjs';
import { annotate, clearMarks } from './annotate.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 768 } });
const page = await ctx.newPage();
const U = createRunner({ laneId: 'HU', imageDir: 'user' });
const A = createRunner({ laneId: 'HA', imageDir: 'admin-data' });

await login(page);

await U.run('G13', 'Xem chi tiet de xuat', async () => {
  await goto(page, '/my-proposals', 2200);
  await page.locator('tbody tr').first().locator('button', { hasText: 'Xem' }).click();
  await page.waitForTimeout(2000);
  await annotate(page, [{ text: 'Xem bản đồ', shape: 'box', label: '1', arrow: 'bottom' }]).catch(() => {});
  await U.shot(page, 'g13_xem-chitiet.jpg');
  await clearMarks(page);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
});

await U.run('G39', 'Form NQ_LK tab long', async () => {
  await goto(page, '/admin/proposals', 2200);
  await page.getByRole('button', { name: 'Tạo đề xuất' }).first().click();
  await page.waitForTimeout(1800);
  const trigger = page.locator('[data-field-key="mo_hinh_dau_tu"] .dynamic-field-select > div').first();
  await trigger.waitFor({ state: 'visible', timeout: 6000 });
  await trigger.scrollIntoViewIfNeeded().catch(() => {});
  await trigger.click();
  await page.waitForTimeout(400);
  await page.locator('.dynamic-select-dropdown >> text=Nhượng quyền + Liên kết').first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Nhượng quyền và Liên kết').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await annotate(page, [{ text: 'Nhượng quyền và Liên kết', shape: 'box', label: '1' }]);
  await U.shot(page, 'g39_nqlk.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
});

await A.run('G40', 'Excel chon bo cot', async () => {
  await goto(page, '/admin/proposals', 2200);
  await page.getByRole('button', { name: 'Export' }).first().click();
  await page.waitForTimeout(600);
  await annotate(page, [{ text: 'Chọn bộ cột để export', shape: 'box', label: '1' }]);
  await A.shot(page, 'g40_excel-bo-cot.jpg');
  await clearMarks(page);
  await page.mouse.click(5, 5).catch(() => {});
});

await A.run('G42', ' Gan ma nhan su 1Office', async () => {
  await goto(page, '/admin/users', 2200);
  await page.locator('tbody tr').first().locator('button', { hasText: 'Xem' }).click();
  await page.waitForTimeout(2000);
  await page.getByText('Liên kết hệ thống').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  await annotate(page, [{ text: 'Liên kết hệ thống', shape: 'box', label: '1' }]);
  await A.shot(page, 'g42_gan-ma-ns.jpg');
  await clearMarks(page);
  await page.keyboard.press('Escape').catch(() => {});
});

await A.run('F42', 'Lay ve / thao tac 1Office', async () => {
  await goto(page, '/admin/proposals', 2200);
  await page.locator('button[title="Thao tác"]').click();
  await page.waitForTimeout(600);
  await annotate(page, [
    { text: 'Lấy về từ 1Office', shape: 'box', label: '1' },
  ]);
  await A.shot(page, 'f42_link-huy.jpg');
  await clearMarks(page);
  await page.mouse.click(5, 5).catch(() => {});
});

U.finish();
A.finish();
await browser.close();
