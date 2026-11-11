const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('supplier rows share pole demand and exhausted actions are disabled', async ({ page }) => {
  const station = { id: 501, ma_tram: 'SUPPLIER-501', proposal_id: 77, status: 'ONBOARDING' };
  let mode = 'available';
  let submitted;
  const options = [
    { id: '60:1', pole_id: 60, name: 'DC60', supplier_id: 1, supplier_name: 'Supplier A', remaining_quantity: 2, stock_quantity: 5 },
    { id: '60:2', pole_id: 60, name: 'DC60', supplier_id: 2, supplier_name: 'Supplier B', remaining_quantity: 2, stock_quantity: 5 },
    { id: '30:1', pole_id: 30, name: 'DC30', supplier_id: 1, supplier_name: 'Supplier A', remaining_quantity: 1, stock_quantity: 1 }
  ];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    let pagination;
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.endsWith('/501/fulfillment')) data = {
      items: [], pole_requirements: [
        { pole_id: 60, name: 'DC60', committed_quantity: 2, remaining_quantity: mode === 'done' ? 0 : 2 },
        { pole_id: 30, name: 'DC30', committed_quantity: 1, remaining_quantity: mode === 'done' ? 0 : 1 }
      ],
      shipping_options: mode === 'available' ? options : [],
      totals: { committed: 3, remaining: mode === 'done' ? 0 : 3 }, shipments: []
    };
    else if (path.endsWith('/501/deployments')) data = [];
    else if (path.endsWith('/charging-stations/501')) data = station;
    else if (path.endsWith('/501/shipments')) {
      submitted = route.request().postDataJSON();
      mode = 'done';
      data = { id: 90 };
    } else if (path.endsWith('/charging-stations')) {
      data = [station];
      pagination = { page: 1, totalPages: 1, total: 1 };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, pagination }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.goto('/admin/on-tram/giao-tru');
  await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
  await page.getByRole('button', { name: 'Xuất trụ theo số lượng', exact: true }).click();
  const child = page.locator('body > .modal');
  await expect(child.getByText('DC60 · Supplier A · còn 2, tồn 5')).toBeVisible();
  await expect(child.getByText('DC60 · Supplier B · còn 2, tồn 5')).toBeVisible();
  const quantities = child.locator('input[type="number"]');
  await expect(quantities.nth(0)).toHaveValue('0');
  await quantities.nth(0).fill('2');
  await quantities.nth(1).fill('1');
  await child.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(child.getByRole('alert')).toContainText('vượt số lượng còn phải giao');
  expect(submitted).toBeUndefined();
  await quantities.nth(0).fill('1');
  await quantities.nth(2).fill('1');
  await child.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(child).toHaveCount(0);
  expect(submitted.items).toEqual([
    { pole_id: 60, supplier_id: 1, quantity: 1 },
    { pole_id: 60, supplier_id: 2, quantity: 1 },
    { pole_id: 30, supplier_id: 1, quantity: 1 }
  ]);
  await expect(page.getByRole('button', { name: 'Xuất trụ theo số lượng', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Đề xuất giao sớm', exact: true })).toBeDisabled();
  await expect(page.getByText('Đã xuất đủ số lượng trụ chốt', { exact: true })).toBeVisible();
  mode = 'empty-stock';
  await page.reload();
  await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
  await expect(page.getByRole('button', { name: 'Xuất trụ theo số lượng', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Đề xuất giao sớm', exact: true })).toBeDisabled();
  await expect(page.getByText('Không có tồn kho cho loại trụ còn thiếu', { exact: true })).toBeVisible();
});
