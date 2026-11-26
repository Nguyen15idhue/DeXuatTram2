const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('proposal edit displays a concurrent status conflict without closing the form', async ({ page }) => {
  const field = { id: 1, key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', type: 'text', visible: true };
  const record = { id: 77, ma_de_xuat: 'DX-77', status: 'PENDING', user_id: 1, custom_data: {}, permissions: { canEdit: true } };
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/admin/proposals/77') && route.request().method() === 'PUT') {
      return route.fulfill({ status: 409, json: {
        success: false, message: 'Trạng thái đề xuất vừa thay đổi; hãy tải lại trước khi lưu'
      } });
    }
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.includes('/field-definitions/entity/')) data = [field];
    else if (path.includes('/dynamic/station_proposals/view/')) data = { fields: [field], allFields: [field] };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/forms/by-entity-purpose')) data = null;
    else if (path.endsWith('/admin/proposals/77')) data = record;
    else if (path.endsWith('/admin/proposals')) data = [record];
    else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], workScopes: [] };
    else if (path.includes('/countdown') || path.endsWith('/assistant/status')) data = {};
    return route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 0, totalPages: 0, limit: 20 } } });
  });
  await page.goto('/admin/proposals/edit=77');
  const popup = page.locator('.popup-detail');
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(popup.getByText('Trạng thái đề xuất vừa thay đổi; hãy tải lại trước khi lưu')).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
});

test('proposal page numbers status labels without changing API codes or other pages', async ({ page }) => {
  const errors = [];
  const proposalQueries = [];
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
      if (path.endsWith('/admin/proposals')) proposalQueries.push(url.searchParams);
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
  expect(proposalQueries.at(-1).get('prioritize_workflow')).toBe('1');
  const columnFilter = page.getByLabel('Lọc trạng thái quy trình');
  await columnFilter.click();
  const labels = (await page.locator('thead').getByRole('checkbox').locator('..').allTextContents()).filter(Boolean);
  expect(labels.slice(0, 3)).toEqual(['1. Mới đề xuất', '2. Đang đánh giá quy hoạch và pháp lý', '3. GĐTTKD đánh giá']);
  expect(labels[15]).toBe('16. Hoạt động');
  expect(labels.slice(16)).toContain('Duyệt chủ trương');
  const request = page.waitForRequest(req => {
    const url = new URL(req.url());
    return url.pathname.endsWith('/admin/proposals') && url.searchParams.get('statuses') === 'GRADING';
  });
  await page.locator('thead').getByText('2. Đang đánh giá quy hoạch và pháp lý', { exact: true }).click();
  await request;
  expect(proposalQueries.at(-1).get('prioritize_workflow')).toBe('1');
  await page.goto('/admin/proposals/view=77');
  await expect(page.locator('.popup-detail').getByText('1. Mới đề xuất', { exact: true })).toBeVisible();
  await page.goto('/admin/proposals/edit=77');
  await expect(page.locator('.popup-detail').getByText('1. Mới đề xuất', { exact: true })).toBeVisible();
  await page.goto('/admin/proposals?tab=requests');
  await expect(page.locator('tbody').getByText('2. Đang đánh giá quy hoạch và pháp lý', { exact: true })).toBeVisible();
  await expect(page.locator('tbody').getByText('1. Mới đề xuất', { exact: true })).toBeVisible();
  await page.goto('/admin/proposals?tab=completed');
  await expect(page.locator('tbody').getByText('14. Đã duyệt BCĐX', { exact: true })).toBeVisible();
  const completedQuery = proposalQueries.findLast(query => query.get('signed_approval_only') === '1');
  expect(completedQuery).toBeDefined();
  expect(completedQuery.has('prioritize_workflow')).toBe(false);
  await page.goto('/my-proposals');
  await expect(page.locator('tbody').getByText('Đang đề xuất', { exact: true })).toBeVisible();
  await expect(page.locator('tbody').getByText('1. Mới đề xuất', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('proposal tables show the selected proposer before the account owner', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fields = [
    { id: 1, key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', type: 'text', visible: true },
    { id: 2, key: 'nguoi_de_xuat', field_key: 'nguoi_de_xuat', label: 'Người đề xuất', type: 'user', visible: true }
  ];
  const records = [
    { id: 77, ma_de_xuat: 'DX-77', user_id: 1, user_name: 'Admin', nguoi_de_xuat: { id: 42, label: 'Người được chọn' } },
    { id: 78, ma_de_xuat: 'DX-78', user_id: 1, user_name: 'Admin', nguoi_de_xuat: null },
    { id: 79, ma_de_xuat: 'DX-79', user_id: null, nguoi_de_xuat: null }
  ];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.includes('/field-definitions/entity/')) data = fields;
    else if (path.includes('/dynamic/station_proposals/view/')) data = { fields, allFields: fields };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/admin/proposals')) data = records;
    else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], workScopes: [] };
    else if (path.includes('/countdown') || path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 3, totalPages: 1, limit: 20 } } });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  for (const tab of ['all', 'completed']) {
    await page.goto(`/admin/proposals?tab=${tab}`);
    const rows = page.locator('tbody tr');
    await expect(rows.filter({ hasText: 'DX-77' }).getByRole('button', { name: 'Người được chọn' })).toBeVisible({ timeout: 15000 });
    await expect(rows.filter({ hasText: 'DX-77' }).getByText('Admin', { exact: true })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'DX-78' }).getByText('Admin', { exact: true })).toBeVisible();
    await expect(rows.filter({ hasText: 'DX-79' }).getByText('Khách', { exact: true })).toBeVisible();
    const userRequest = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/admin/users/42'));
    await rows.filter({ hasText: 'DX-77' }).getByRole('button', { name: 'Người được chọn' }).click();
    await userRequest;
  }
  expect(errors).toEqual([]);
});

test('proposal legal name column stays narrow and exposes the full value', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const label = 'Tên pháp nhân (Tên công ty/ Hộ kinh doanh)';
  const longName = 'Công ty Cổ phần Kinh doanh và Phát triển Hạ tầng Trạm sạc Việt Nam';
  const longWord = 'CONGTY' + 'A'.repeat(100);
  const fields = [
    { id: 1, key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', type: 'text', visible: true, width: 140 },
    { id: 2, key: 'owner_name', field_key: 'owner_name', label, type: 'text', visible: true, width: 100, filterable: true }
  ];
  const records = [
    { id: 77, ma_de_xuat: 'DX-77', owner_name: longName, address: 'Địa chỉ đầy đủ để kiểm tra' },
    { id: 78, ma_de_xuat: 'DX-78', owner_name: 'Tên ngắn' },
    { id: 79, ma_de_xuat: 'DX-79', owner_name: longWord },
    { id: 80, ma_de_xuat: 'DX-80', owner_name: '' }
  ];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.includes('/field-definitions/entity/')) data = fields;
    else if (path.includes('/dynamic/station_proposals/view/')) data = { fields, allFields: fields };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/admin/proposals')) data = records;
    else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], workScopes: [] };
    else if (path.includes('/countdown') || path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 4, totalPages: 1, limit: 20 } } });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const tab of ['all', 'completed']) {
      await page.goto(`/admin/proposals?tab=${tab}`);
      const header = page.getByRole('columnheader', { name: label });
      await expect(header).toBeVisible({ timeout: 15000 });
      const headerDetails = await header.evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return { width: el.getBoundingClientRect().width, lines: range.getClientRects().length, whiteSpace: getComputedStyle(el).whiteSpace };
      });
      expect(headerDetails.width).toBeLessThanOrEqual(181);
      expect(headerDetails.whiteSpace).toBe('normal');
      expect(headerDetails.lines).toBeGreaterThan(1);
      const name = page.getByLabel(`Tên pháp nhân: ${longName}`);
      const truncated = await name.evaluate(el => el.scrollWidth > el.clientWidth);
      expect(truncated).toBe(true);
      await name.hover();
      await expect(page.getByRole('tooltip')).toHaveText(longName);
      await name.focus();
      await expect(page.getByRole('tooltip')).toHaveText(longName);
      await name.blur();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await expect(page.getByLabel('Tên pháp nhân: Tên ngắn')).toBeVisible();
      expect(await page.getByLabel(`Tên pháp nhân: ${longWord}`).evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await expect(page.locator('tbody tr').filter({ hasText: 'DX-80' }).getByText('-', { exact: true }).first()).toBeVisible();
      const address = page.getByLabel('Địa chỉ chi tiết: Địa chỉ đầy đủ để kiểm tra');
      await address.focus();
      await expect(page.getByRole('tooltip')).toHaveText('Địa chỉ đầy đủ để kiểm tra');
      await address.blur();
    }
  }
  expect(errors).toEqual([]);
});
