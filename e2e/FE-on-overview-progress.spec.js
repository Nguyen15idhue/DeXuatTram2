const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

const mockApi = async (page, role = 'SUPER_ADMIN', allowCreate = true) => {
  const writes = [];
  const logs = [{ id: 7, created_by: 10, employee_user_id: 99, updater_name: 'Actual updater',
    contact_time: '2026-11-13T02:03:00', content: 'Legacy progress entry' }];
  const counts = { overview: 8, contract: 2, infrastructure: 1, delivery: 0, installation: 0, acceptance: 0, on_station: 0, finance: 0 };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = {};
    let permissions;
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, full_name: 'Current user', role, custom_data: { department: 'Back Office' } } };
    else if (pathname.endsWith('/charging-stations/task-counts')) data = { total: 3, counts };
    else if (pathname.endsWith('/charging-stations')) data = [{
      id: 501, ma_tram: 'ON-501', proposal_id: 77, owner_name: 'Station owner', status: 'ONBOARDING',
      contract_status: 'DOING', infra_power_status: 'NOT', infra_site_status: 'DOING',
      fulfillment: { items: [], totals: { committed: 4, operating: 0 } },
      can_cancel_on_station: true, can_mark_on_station_active: true, delivery_ready: true
    }];
    else if (pathname.endsWith('/care-logs/7/updater')) data = { id: 10, full_name: 'Actual updater', role: 'SALES', department: 'Sales team', chuc_vu: 'Director' };
    else if (pathname.endsWith('/501/care-logs')) {
      if (request.method() === 'POST') {
        writes.push(request.postDataJSON());
        logs.unshift({ id: 8, created_by: 1, updater_name: 'Current user', ...request.postDataJSON() });
        data = { id: 8 };
      } else {
        data = logs;
        permissions = { create: allowCreate, manage: role === 'SUPER_ADMIN' };
      }
    } else if (pathname.endsWith('/care-logs/7') && request.method() === 'DELETE') {
      logs.splice(logs.findIndex(row => row.id === 7), 1);
    }
    await route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ success: true, data, permissions, pagination: { page: 1, total: 1, totalPages: 1 } }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'overview-test'));
  return writes;
};

test('overview tabs, scoped badge, two frozen columns and portalled action menu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockApi(page);
  await page.goto('/admin/on-tram/thong-tin-chung');
  await expect(page.getByRole('tab', { name: /Cần theo dõi tiến độ/ })).toContainText('8');
  await expect(page.getByRole('tab', { name: 'Trạm sạc đã ON', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Mã đề xuất', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Cập nhật tiến độ', exact: true })).toBeVisible();
  await expect(page.locator('thead tr').first().locator('th.dt-frozen')).toHaveCount(2);
  const sidebar = page.getByRole('link', { name: /Thông tin chung/ });
  await expect(sidebar).toContainText('8');
  await expect(page.getByRole('link', { name: 'Chi tiết', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Thao tác khác ON-501' }).click();
  for (const name of ['Sửa', 'Đổi trạng thái', 'Hủy ON trạm', 'Xóa ON trạm', 'Đã ON Trạm']) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('menuitem', { name: 'Đổi trạng thái', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đổi trạng thái ON trạm', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

for (const [role, allowCreate, mobile] of [['SUPER_ADMIN', true, false], ['SALES', true, false], ['ADMIN', false, false], ['SALES', true, true]]) {
  test(`progress modal authorship, history, profile and permissions for ${role}${mobile ? ' on mobile' : ''}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const writes = await mockApi(page, role, allowCreate);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/admin/on-tram/thong-tin-chung');
    await page.getByRole('button', { name: 'Cập nhật tiến độ', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cập nhật tiến độ — ON-501', exact: true })).toBeVisible();
    const dialog = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Cập nhật tiến độ — ON-501', exact: true }) });
    await expect(dialog.getByRole('columnheader', { name: 'STT', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Actual updater', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thông tin người cập nhật', exact: true })).toBeVisible();
    await expect(page.getByText('Sales team', { exact: true })).toBeVisible();
    await page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Thông tin người cập nhật' }) }).getByRole('button', { name: 'Đóng', exact: true }).click();
    if (allowCreate) {
      await page.getByRole('button', { name: 'Thêm dòng', exact: true }).click();
      await expect(page.getByText('Người cập nhật: Current user', { exact: true })).toBeVisible();
      const current = await page.getByLabel('Thời gian cập nhật', { exact: true }).inputValue();
      expect(current).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      await page.getByLabel('Thời gian cập nhật', { exact: true }).fill('2026-11-12T19:30');
      await page.getByLabel('Nội dung chăm sóc', { exact: true }).fill('Follow up progress');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(page.getByText('Follow up progress', { exact: true })).toBeVisible();
      expect(writes).toEqual([{ contact_time: '2026-11-12T19:30', content: 'Follow up progress' }]);
    } else await expect(page.getByRole('button', { name: 'Thêm dòng', exact: true })).toHaveCount(0);
    if (role !== 'SUPER_ADMIN') {
      await expect(dialog.getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Xóa', exact: true })).toHaveCount(0);
    } else {
      const row = dialog.locator('tbody tr').filter({ hasText: 'Legacy progress entry' });
      await row.getByRole('button', { name: 'Xóa', exact: true }).click();
      await page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Xóa dòng tiến độ', exact: true }) }).getByRole('button', { name: 'Xóa', exact: true }).click();
      await expect(page.getByText('Legacy progress entry', { exact: true })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test('mobile overview action menu stays inside viewport after horizontal table scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/admin/on-tram/thong-tin-chung');
  await page.getByRole('button', { name: 'Thao tác khác ON-501' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
  await expect(page.getByLabel('Ngày ON thực tế', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
});

for (const stage of ['khoi-tao-hop-dong', 'xay-dung-ha-tang', 'giao-tru', 'lap-tru', 'nghiem-thu', 'on-tram']) {
  test(`${stage} puts station owner third and freezes three columns`, async ({ page }) => {
    await mockApi(page);
    await page.goto(`/admin/on-tram/${stage}?tab=all`);
    const headers = page.locator('thead tr').first().locator('th');
    await expect(headers.nth(0)).toHaveText('STT');
    await expect(headers.nth(1)).toHaveText('Mã trạm');
    await expect(headers.nth(2)).toHaveText('Chủ trạm');
    await expect(page.getByRole('columnheader', { name: 'Mã đề xuất', exact: true })).toHaveCount(0);
    await expect(page.locator('thead tr').first().locator('th.dt-frozen')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Chi tiết', exact: true })).toHaveCount(0);
  });
}
