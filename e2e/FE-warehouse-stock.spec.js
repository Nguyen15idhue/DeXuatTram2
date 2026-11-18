const { test, expect } = require('@playwright/test');

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5175' });

const setup = async (page, { role = 'ADMIN', conflict = false, saveError = false, readError = false } = {}) => {
  const errors = [];
  const writes = [];
  const suppliers = [{ id: 1, name: 'Supplier A' }, { id: 2, name: 'Supplier B' }];
  const poles = {
    1: [
      { id: 11, charging_pole_id: 120, name: 'Model 120', charging_type: 'DC', power_kw: '120.00', quantity: 5 },
      { id: 12, charging_pole_id: 7, name: 'Model 7', charging_type: 'AC', power_kw: '7.00', quantity: 3 },
      { id: 13, charging_pole_id: 22, name: 'Model 22', charging_type: 'AC', power_kw: '22.00', quantity: 8 }
    ],
    2: [{ id: 14, charging_pole_id: 22, name: 'Model 22 B', charging_type: 'AC', power_kw: '22.00', quantity: 4 }]
  };
  page.on('pageerror', cause => errors.push(cause.message));
  await page.addInitScript(() => localStorage.setItem('token', 'warehouse-ui-fixture'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path === '/api/auth/me') {
      data = { user: { id: 1, role, full_name: 'Warehouse Tester', department: 'Back Office', custom_data: { department: 'Back Office' } } };
    } else if (path === '/api/admin/suppliers') {
      data = suppliers;
    } else if (/\/suppliers\/\d+\/poles$/.test(path)) {
      const id = Number(path.split('/').at(-2));
      if (readError && id === 2) {
        await route.fulfill({ status: 500, json: { success: false, message: 'Không tải được tồn kho nhà cung cấp' } });
        return;
      }
      data = poles[id];
    } else if (/\/warehouse\/stock\/\d+\/\d+$/.test(path)) {
      const body = route.request().postDataJSON();
      const [, supplierId, poleId] = /stock\/(\d+)\/(\d+)$/.exec(path);
      writes.push({ supplierId: Number(supplierId), poleId: Number(poleId), body });
      const row = poles[supplierId].find(pole => pole.charging_pole_id === Number(poleId));
      if (conflict) {
        row.quantity = 14;
        await route.fulfill({ status: 409, json: { success: false, code: 'STOCK_CONFLICT', message: 'Số lượng tồn đã thay đổi. Vui lòng tải lại dữ liệu trước khi chỉnh sửa.' } });
        return;
      }
      if (saveError) {
        await route.fulfill({ status: 500, json: { success: false, message: 'Không lưu được tồn kho' } });
        return;
      }
      row.quantity = body.quantity;
      data = { quantity: body.quantity };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  return { errors, writes };
};

test('stock groups sort by numeric power and a detail link handles decimal power correctly', async ({ page }) => {
  const { errors } = await setup(page);
  await page.goto('/admin/kho?tab=stock');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody tr td:nth-child(3)')).toHaveText(['7', '22', '120']);
  await page.locator('tbody tr').first().getByRole('button', { name: 'Chi tiết', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chi tiết tồn kho: AC 7kW' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Model 7');
  expect(errors).toEqual([]);
});

for (const role of ['ADMIN', 'SUPER_ADMIN']) {
  test(`${role} can adjust zero and positive stock with refreshed totals and stable order`, async ({ page }) => {
    const { errors, writes } = await setup(page, { role });
    await page.goto('/admin/kho/ton-kho');
    await expect(page.locator('tbody tr td:nth-child(5)')).toHaveText(['7', '22', '22', '120']);
    const row = page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'Model 22', exact: true }) });
    for (const [quantity, expected, total] of [[0, 8, 12], [10, 0, 22]]) {
      await row.getByRole('button', { name: 'Sửa tồn kho', exact: true }).click();
      const modal = page.locator('.modal-box');
      await expect(modal.getByRole('button', { name: 'Đóng', exact: true })).toBeVisible();
      await page.getByRole('spinbutton', { name: 'Số lượng tồn mới' }).fill(String(quantity));
      await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(modal).toHaveCount(0);
      await expect(row.locator('td').nth(5)).toHaveText(String(quantity));
      await expect(page.getByText('Tổng tồn:', { exact: false })).toHaveText(`Tổng tồn: ${total}`);
      expect(writes.at(-1)).toEqual({ supplierId: 1, poleId: 22, body: { quantity, expected_quantity: expected } });
      await expect(page.locator('tbody tr td:nth-child(5)')).toHaveText(['7', '22', '22', '120']);
    }
    expect(errors).toEqual([]);
  });
}

test('Back Office SALES can view stock but cannot adjust it', async ({ page }) => {
  const { errors, writes } = await setup(page, { role: 'SALES' });
  await page.goto('/admin/kho/ton-kho');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Sửa tồn kho', exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('invalid input and cancel never send an inventory write', async ({ page }) => {
  const { errors, writes } = await setup(page);
  await page.goto('/admin/kho/ton-kho?type=AC&power=22');
  await page.getByRole('button', { name: 'Sửa tồn kho', exact: true }).first().click();
  const modal = page.locator('.modal-box');
  for (const value of ['', '-1', '1.5', '2147483648']) {
    await page.getByRole('spinbutton', { name: 'Số lượng tồn mới' }).fill(value);
    await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(modal.getByRole('alert')).toContainText('Số lượng tồn phải là số nguyên');
  }
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('stale stock is reported and reloaded before the next edit', async ({ page }) => {
  const { errors, writes } = await setup(page, { conflict: true });
  await page.goto('/admin/kho/ton-kho?type=AC&power=22');
  await page.getByRole('button', { name: 'Sửa tồn kho', exact: true }).first().click();
  await page.getByRole('spinbutton', { name: 'Số lượng tồn mới' }).fill('2');
  await page.locator('.modal-box').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await expect(page.getByText(/Số lượng tồn đã thay đổi/)).toBeVisible();
  await expect(page.locator('tbody tr').first().locator('td').nth(5)).toHaveText('14');
  await page.getByRole('button', { name: 'Sửa tồn kho', exact: true }).first().click();
  await expect(page.getByRole('spinbutton', { name: 'Số lượng tồn mới' })).toHaveValue('14');
  expect(writes).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('failed save keeps the dialog open and does not display a success', async ({ page }) => {
  const { errors } = await setup(page, { saveError: true });
  await page.goto('/admin/kho/ton-kho?type=AC&power=22');
  await page.getByRole('button', { name: 'Sửa tồn kho', exact: true }).first().click();
  await page.getByRole('spinbutton', { name: 'Số lượng tồn mới' }).fill('2');
  await page.locator('.modal-box').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('.modal-box').getByRole('alert')).toHaveText('Không lưu được tồn kho');
  await expect(page.getByText('Đã cập nhật tồn kho', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('failed supplier reads show an error instead of partial stock totals', async ({ page }) => {
  const { errors } = await setup(page, { readError: true });
  await page.goto('/admin/kho/ton-kho');
  await expect(page.getByRole('alert')).toContainText('Không tải được tồn kho nhà cung cấp');
  await expect(page.getByText('Tổng tồn:', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sửa tồn kho', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
