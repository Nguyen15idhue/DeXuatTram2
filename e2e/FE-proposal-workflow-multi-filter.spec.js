const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5174' });

test('workflow filters search, apply and reset multiple values', async ({ page }) => {
  const queries = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fields = [
    { id: 1, key: 'mo_hinh_dau_tu', type: 'select', options: [{ value: 'NQ', label: 'Nhượng quyền' }, { value: 'LK', label: 'Liên kết' }] },
    { id: 2, key: 'province', type: 'select', options: [{ value: 'Hà Nội', label: 'Hà Nội' }, { value: 'Đà Nẵng', label: 'Đà Nẵng' }] },
    { id: 3, key: 'status', type: 'select', options: [{ value: 'GRADING', label: 'Đang đánh giá' }] }
  ];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.includes('/field-definitions/entity/')) data = fields;
    else if (path.includes('/dynamic/station_proposals/view/')) data = { fields, allFields: fields };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], provinces: [], models: [], regions: [] };
    else if (/\/admin\/proposal-(grading|reviews|layouts|reports|approvals|signatures)$/.test(path)) {
      queries.push({ path, params: url.searchParams });
    } else if (path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true, data, meta: { isAdmin: true, isSuperAdmin: true, isManager: true },
      pagination: { page: Number(url.searchParams.get('page') || 1), total: 0, totalPages: 0, limit: 20 }
    }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  const choose = async (label, selections) => {
    const control = page.getByRole('button', { name: label, exact: true });
    await control.click();
    const dropdown = control.locator('..');
    for (const [term, option] of selections) {
      await dropdown.getByPlaceholder('Tìm kiếm...').fill(term);
      await dropdown.getByText(option, { exact: true }).click();
    }
    await control.click();
  };
  const cases = [
    ['danh-gia-quy-hoach', 'grading'],
    ['yeu-cau-cham-diem-lai', 'reviews'],
    ['danh-gia-layout', 'layouts'],
    ['lap-to-trinh', 'reports'],
    ['duyet-bcdx', 'approvals']
  ];
  for (const [path, api] of cases) {
    await page.goto(`/admin/proposals/${path}?tab=all`);
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    await choose('Tất cả tỉnh/thành', [['ha noi', 'Hà Nội'], ['da nang', 'Đà Nẵng']]);
    await choose('Tất cả mô hình đầu tư', [['nhuong', 'Nhượng quyền'], ['lien ket', 'Liên kết']]);
    await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    const latest = () => queries.filter(q => q.path.endsWith(`/proposal-${api}`)).at(-1)?.params;
    await expect.poll(() => latest()?.getAll('province')).toEqual(['Hà Nội', 'Đà Nẵng']);
    expect(latest().getAll('model')).toEqual(['NQ', 'LK']);
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    await page.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
    await expect.poll(() => latest()?.getAll('province')).toEqual([]);
  }
  await page.goto('/admin/proposals/trinh-ky?tab=all');
  await choose('Lọc công việc ký cá nhân', [['can ky', 'Tôi cần ký'], ['da ky', 'Tôi đã ký xong']]);
  await choose('Mô hình: Tất cả', [['nhuong', 'Nhượng quyền'], ['lien ket', 'Liên kết']]);
  const latestSignature = () => queries.filter(q => q.path.endsWith('/proposal-signatures')).at(-1)?.params;
  await expect.poll(() => latestSignature()?.getAll('my_status')).toEqual(['my_pending', 'my_signed']);
  await expect.poll(() => latestSignature()?.getAll('mo_hinh')).toEqual(['NQ', 'LK']);
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect.poll(() => latestSignature()?.getAll('my_status')).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/proposals/duyet-bcdx?tab=all');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await choose('Tất cả tỉnh/thành', [['ha noi', 'Hà Nội'], ['da nang', 'Đà Nẵng']]);
  await page.locator('dialog').getByRole('button', { name: 'Áp dụng', exact: true }).click();
  const latestApproval = () => queries.filter(q => q.path.endsWith('/proposal-approvals')).at(-1)?.params;
  await expect.poll(() => latestApproval()?.getAll('province')).toEqual(['Hà Nội', 'Đà Nẵng']);
  expect(errors).toEqual([]);
});
