const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

async function setup(page, role) {
  const writes = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'commitment-fixture'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    let data = [];
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: 1, role, custom_data: {} } };
    else if (url.pathname.endsWith('/charging-stations/task-counts')) data = { counts: {}, total: 0 };
    else if (url.pathname.endsWith('/charging-stations')) data = [{ id: 501, ma_tram: 'ON-501', status: 'DELIVERING' }];
    else if (url.pathname.endsWith('/501/commitments')) {
      if (method === 'PUT') writes.push(route.request().postDataJSON());
      data = { token: 'version', from_proposal: false, poles: [{ id: 5, name: 'DC120' }],
        rows: [{ source_key: 'line:1', mo_hinh: 'NQ', pole_id: 5, loai_tru: 'DC120',
          so_luong: 4, min_quantity: 2, has_evidence: true }] };
    }
    await route.fulfill({ json: { success: true, data,
      pagination: { page: 1, total: Array.isArray(data) ? data.length : 1, totalPages: 1 } } });
  });
  return { writes, errors };
}

test('SUPER_ADMIN edits commitments with minimum and evidence visible', async ({ page }) => {
  const { writes, errors } = await setup(page, 'SUPER_ADMIN');
  await page.goto('/admin/on-tram/thong-tin-chung');
  await page.getByRole('button', { name: 'Thao tác khác ON-501' }).click();
  await page.getByRole('menuitem', { name: 'Cập nhật trụ chốt' }).click();
  await expect(page.getByText('Số lượng (tối thiểu 2)')).toBeVisible();
  await expect(page.getByLabel('Loại trụ dòng 1')).toBeDisabled();
  await expect(page.getByLabel('Mô hình dòng 1')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Xóa dòng' })).toBeDisabled();
  await page.getByLabel('Số lượng dòng 1').fill('3');
  await page.getByLabel('Lý do cập nhật').fill('Điều chỉnh');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã cập nhật trụ chốt')).toBeVisible();
  expect(writes).toEqual([{ rows: [{ source_key: 'line:1', mo_hinh: 'NQ', pole_id: 5, so_luong: '3' }],
    reason: 'Điều chỉnh', expected_token: 'version' }]);
  expect(errors).toEqual([]);
});

test('ADMIN cannot access the commitment editor', async ({ page }) => {
  const { writes, errors } = await setup(page, 'ADMIN');
  await page.goto('/admin/on-tram/thong-tin-chung');
  await expect(page.getByText('ON-501')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Cập nhật trụ chốt' })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
