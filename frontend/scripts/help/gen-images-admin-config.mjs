import { chromium } from 'playwright';
import { login, goto, BASE, createRunner } from './shared.mjs';
import { annotate, clearMarks } from './annotate.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 768 } });
const page = await ctx.newPage();
const R = createRunner({ laneId: 'C', imageDir: 'admin-config' });

await login(page);

await R.run('C01', 'Field Definitions', async () => {
  await goto(page, '/admin/fields', 1800);
  await annotate(page, [{ text: 'Thêm field', shape: 'box', label: '1', arrow: 'left' }]);
  await R.shot(page, 'c01_fields.jpg');
  await clearMarks(page);
});

await R.run('C02', 'Forms Manager', async () => {
  await goto(page, '/admin/forms', 1600);
  await R.shot(page, 'c02_forms.jpg');
  await clearMarks(page);
});

await R.run('C03', 'Form Builder', async () => {
  await page.getByRole('button', { name: /hỉnh sửa|ửa|Edit/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await annotate(page, [{ text: 'Lưu form', shape: 'box', label: '1', arrow: 'right' }]);
  await R.shot(page, 'c03_form-builder.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
});

await R.run('C04', 'Views Manager', async () => {
  await goto(page, '/admin/views', 1600);
  await R.shot(page, 'c04_views.jpg');
  await clearMarks(page);
});

await R.run('C05', 'View Builder', async () => {
  await page.getByRole('button', { name: /hỉnh sửa|ửa|Edit|Tạo view/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await annotate(page, [{ text: 'Lưu view', shape: 'box', label: '1', arrow: 'right' }]);
  await R.shot(page, 'c05_view-builder.jpg');
  await clearMarks(page);
  await page.getByRole('button', { name: 'Hủy' }).first().click().catch(() => {});
});

await R.run('C06', 'Data Lists', async () => {
  await goto(page, '/admin/data-lists', 1600);
  await annotate(page, [{ text: 'Tạo mới', shape: 'box', label: '1', arrow: 'left' }]);
  await R.shot(page, 'c06_data-lists.jpg');
  await clearMarks(page);
});

await R.run('C07', 'Map Config', async () => {
  await goto(page, '/admin/map-config', 2000);
  await annotate(page, [
    { text: 'Lưu cấu hình', shape: 'box', label: '1', arrow: 'right' },
    { text: 'Test kết nối', shape: 'box', label: '2' },
  ]);
  await R.shot(page, 'c07_map-config.jpg');
  await clearMarks(page);
});

await R.run('C08', 'Geocode Config', async () => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await annotate(page, [{ text: 'Lưu cấu hình địa chỉ', shape: 'box', label: '1' }]);
  await R.shot(page, 'c08_geocode.jpg');
  await clearMarks(page);
});

await R.run('C09', 'Phân quyền', async () => {
  await goto(page, '/admin/roles', 1400);
  await R.shot(page, 'c09_roles.jpg');
  await clearMarks(page);
});

await R.run('C10', 'API Configs', async () => {
  await goto(page, '/admin/api-configs', 1800);
  await annotate(page, [{ text: 'Thêm API', shape: 'box', label: '1', arrow: 'left' }]);
  await R.shot(page, 'c10_api-configs.jpg');
  await clearMarks(page);
});

await R.run('C11', 'Field Mapping', async () => {
  await page.getByRole('button', { name: 'Mapping' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await R.shot(page, 'c11_mapping.jpg');
  await clearMarks(page);
});

await R.run('C12', 'Swagger API Docs', async () => {
  await page.goto('http://localhost:3000/api-docs');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await R.shot(page, 'c12_swagger.jpg');
  await clearMarks(page);
});

R.finish();
await browser.close();
