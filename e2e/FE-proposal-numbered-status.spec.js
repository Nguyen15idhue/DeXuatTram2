const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('proposal page numbers status labels without changing API codes or other pages', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const options = [
    { value: 'PENDING', label: 'Đang đề xuất', color: '#facc15' },
    { value: 'GRADING', label: 'Đang đánh giá', color: '#f59e0b' },
    { value: 'APPROVED', label: 'Đã duyệt BCĐX', color: '#16a34a' }
  ];
  const fields = [
    { id: 1, key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', type: 'text', visible: true },
    { id: 2, key: 'status', field_key: 'status', label: 'Trạng thái', type: 'select', options, visible: true, filterable: true }
  ];
  const record = { id: 77, ma_de_xuat: 'DX-77', status: 'PENDING', user_id: 1, owner_name: 'Fixture', custom_data: {}, permissions: { canEdit: true } };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.includes('/field-definitions/entity/')) data = fields;
    else if (path.includes('/dynamic/station_proposals/view/')) data = { fields, allFields: fields };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/forms/by-entity-purpose')) data = null;
    else if (path.endsWith('/admin/proposals/77')) data = record;
    else if (path.endsWith('/admin/proposals') || path.endsWith('/my-proposals')) {
      data = [{ ...record, status: url.searchParams.has('signed_approval_only') ? 'APPROVED' : 'PENDING' }];
    }
    else if (path.endsWith('/admin/proposal-requests')) data = [{
      id: 3, proposal_id: 77, ma_de_xuat: 'DX-77', proposal_status: 'GRADING', previous_status: 'PENDING',
      description: 'Fixture request', created_at: '2026-11-11T00:00:00Z'
    }];
    else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], workScopes: [] };
    else if (path.includes('/countdown') || path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true, data, pagination: { page: 1, total: 1, totalPages: 1, limit: 20 }
    }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.goto('/admin/proposals');
  await expect(page.locator('tbody').getByText('1. Mới đề xuất', { exact: true })).toBeVisible({ timeout: 15000 });
  const columnFilter = page.getByLabel('Lọc trạng thái quy trình');
  const labels = await columnFilter.locator('option').allTextContents();
  expect(labels.slice(1, 4)).toEqual(['1. Mới đề xuất', '2. Đang đánh giá quy hoạch và pháp lý', '3. GĐTTKD đánh giá']);
  expect(labels[16]).toBe('16. Hoạt động');
  expect(labels.slice(17)).toContain('Duyệt chủ trương');
  const request = page.waitForRequest(req => {
    const url = new URL(req.url());
    return url.pathname.endsWith('/admin/proposals') && url.searchParams.get('statuses') === 'GRADING';
  });
  await columnFilter.selectOption('GRADING');
  await request;
  await page.goto('/admin/proposals/view=77');
  await expect(page.locator('.popup-detail').getByText('1. Mới đề xuất', { exact: true })).toBeVisible();
  await page.goto('/admin/proposals/edit=77');
  await expect(page.locator('.popup-detail').getByText('1. Mới đề xuất', { exact: true })).toBeVisible();
  await page.goto('/admin/proposals?tab=requests');
  await expect(page.locator('tbody').getByText('2. Đang đánh giá quy hoạch và pháp lý', { exact: true })).toBeVisible();
  await expect(page.locator('tbody').getByText('1. Mới đề xuất', { exact: true })).toBeVisible();
  await page.goto('/admin/proposals?tab=completed');
  await expect(page.locator('tbody').getByText('14. Đã duyệt BCĐX', { exact: true })).toBeVisible();
  await page.goto('/my-proposals');
  await expect(page.locator('tbody').getByText('Đang đề xuất', { exact: true })).toBeVisible();
  await expect(page.locator('tbody').getByText('1. Mới đề xuất', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
