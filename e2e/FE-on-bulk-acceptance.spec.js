const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

const setup = async (page, role, timeout = false) => {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'bulk-acceptance-fixture'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    let data = [];
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: 1, role } };
    else if (url.pathname.endsWith('/charging-stations/task-counts')) data = { counts: { acceptance: requests.length ? 0 : 2 } };
    else if (url.pathname.endsWith('/acceptance/bulk/preview')) {
      expect(url.search).toBe('');
      data = { request_id: 'preview-1', batch_size: timeout ? 1 : 20, stations: [
        { id: 1, ma_tram: 'ELIGIBLE-A', portions: 1, quantity: 2, token: 'a' },
        { id: 25, ma_tram: 'ELIGIBLE-B', portions: 0, quantity: 0, legacy: true, token: 'b' },
      ] };
    } else if (url.pathname.endsWith('/acceptance/bulk')) {
      expect(method).toBe('POST');
      requests.push(route.request().postDataJSON());
      if (timeout && requests.length === 2) return route.fulfill({ status: 504, body: 'Gateway timeout' });
      data = { stations: timeout && requests.length === 1 ? [{ id: 1, status: 'updated', portions: 1, quantity: 2 }]
        : requests.length === 1 ? [
        { id: 1, status: 'updated', portions: 1, quantity: 2 },
        { id: 25, status: 'failed', retryable: true, message: 'Thử lại trạm này' },
      ] : [{ id: 25, status: 'updated', portions: 0, quantity: 0 }] };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  return { requests, errors };
};

test('super admin previews all qualifying stations from a filtered tab and retries only failed stations', async ({ page }) => {
  const { requests, errors } = await setup(page, 'SUPER_ADMIN');
  await page.goto('/admin/on-tram/nghiem-thu?tab=completed');
  const search = page.getByPlaceholder(/Tìm mã trạm/);
  await search.fill('filter-with-no-results');
  await page.getByRole('button', { name: 'Nghiệm thu hàng loạt' }).click();
  const preview = page.getByRole('list', { name: 'Danh sách trạm nghiệm thu' });
  await expect(preview.getByText('ELIGIBLE-B')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xác nhận nghiệm thu đạt' }).click();
  await expect(page.getByRole('alert')).toHaveText('Lý do bắt buộc từ 3–5000 ký tự');
  expect(requests).toHaveLength(0);
  await page.getByLabel('Lý do nghiệm thu hàng loạt').fill('  Đã kiểm tra  ');
  await page.getByRole('button', { name: 'Xác nhận nghiệm thu đạt' }).click();
  await expect(page.getByText(/Đã cập nhật: 1 trạm.*Lỗi: 1/)).toBeVisible();
  await expect(preview.getByText(/Thử lại trạm này/)).toBeVisible();
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByText(/Đã cập nhật: 2 trạm.*Lỗi: 0/)).toBeVisible();
  expect(requests).toEqual([
    { reason: 'Đã kiểm tra', request_id: 'preview-1', stations: [{ id: 1, token: 'a' }, { id: 25, token: 'b' }] },
    { reason: 'Đã kiểm tra', request_id: 'preview-1', stations: [{ id: 25, token: 'b' }] },
  ]);
  expect(errors).toEqual([]);
});

test('ordinary admin does not see the bulk acceptance action', async ({ page }) => {
  await setup(page, 'ADMIN');
  await page.goto('/admin/on-tram/nghiem-thu');
  await expect(page.getByPlaceholder(/Tìm mã trạm/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nghiệm thu hàng loạt' })).toHaveCount(0);
});

test('a timed-out batch preserves confirmed progress and retries with the same request ID', async ({ page }) => {
  const { requests } = await setup(page, 'SUPER_ADMIN', true);
  await page.goto('/admin/on-tram/nghiem-thu');
  await page.getByRole('button', { name: 'Nghiệm thu hàng loạt' }).click();
  await page.getByLabel('Lý do nghiệm thu hàng loạt').fill('Đã kiểm tra');
  await page.getByRole('button', { name: 'Xác nhận nghiệm thu đạt' }).click();
  await expect(page.getByText(/Đã cập nhật: 1 trạm.*Chưa có kết quả: 1/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(/Chưa nhận được kết quả của lô này/);
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByText(/Đã cập nhật: 2 trạm.*Chưa có kết quả: 0/)).toBeVisible();
  expect(requests.map(request => request.stations.map(row => row.id))).toEqual([[1], [25], [25]]);
  expect(requests[2]).toEqual(requests[1]);
});
