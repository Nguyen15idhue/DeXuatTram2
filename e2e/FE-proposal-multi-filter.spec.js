const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('proposal tabs search and combine multiple filters before pagination', async ({ page }) => {
  const errors = [];
  const queries = [];
  page.on('pageerror', error => errors.push(error.message));
  const options = [
    { value: 'PENDING', label: 'Đang đề xuất' },
    { value: 'GRADING', label: 'Đang đánh giá' },
    { value: 'APPROVED', label: 'Đã duyệt BCĐX' },
    { value: 'CANCELLED', label: 'Đã hủy' }
  ];
  const fields = [
    { id: 1, key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', type: 'text', visible: true },
    { id: 2, key: 'status', field_key: 'status', label: 'Trạng thái', type: 'select', options, visible: true, filterable: true },
    { id: 3, key: 'mo_hinh_dau_tu', type: 'select', options: [{ value: 'NQ', label: 'Nhượng quyền' }, { value: 'LK', label: 'Liên kết' }] },
    { id: 4, key: 'province', type: 'select', options: [{ value: 'Hà Nội', label: 'Hà Nội' }, { value: 'Đà Nẵng', label: 'Đà Nẵng' }] },
    { id: 5, key: 'vung_mien', type: 'select', options: [{ value: 'Bac', label: 'Miền Bắc' }, { value: 'Nam', label: 'Miền Nam' }] }
  ];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.includes('/field-definitions/entity/')) data = fields;
    else if (path.includes('/dynamic/station_proposals/view/')) data = { fields, allFields: fields };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/filter-options')) data = {
      owners: [{ id: 10, name: 'Người A' }, { id: 11, name: 'Người B' }],
      managers: [{ id: 20, name: 'Quản lý A' }, { id: 21, name: 'Quản lý B' }],
      workScopes: [{ value: 'all', label: 'Tất cả công việc' }, { value: 'mine', label: 'Công việc của tôi' }]
    };
    else if (path.endsWith('/admin/proposals') || path.endsWith('/admin/proposal-requests')) {
      queries.push({ path, params: url.searchParams });
      data = path.endsWith('/admin/proposals')
        ? [{ id: 77, ma_de_xuat: 'DX-77', status: 'PENDING', user_id: 1, custom_data: {} }]
        : [{ id: 3, proposal_id: 77, ma_de_xuat: 'DX-77', request_type: 'UPDATE_INFO', proposal_status: 'PENDING' }];
    }
    else if (path.includes('/countdown') || path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true, data, pagination: { page: Number(url.searchParams.get('page') || 1), total: 45, totalPages: 3, limit: 20 }
    }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  const latest = (suffix) => queries.filter(q => q.path.endsWith(suffix)).at(-1)?.params;
  const choose = async (label, selections) => {
    const control = page.getByRole('button', { name: label, exact: true });
    await control.click();
    const dropdown = control.locator('..');
    for (const [search, option] of selections) {
      await dropdown.getByPlaceholder('Tìm kiếm...').fill(search);
      await dropdown.getByText(option, { exact: true }).click();
    }
    await control.click();
  };

  await page.goto('/admin/proposals');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await choose('Tất cả trạng thái', [['danh gia', '2. Đang đánh giá quy hoạch và pháp lý'], ['moi de', '1. Mới đề xuất']]);
  await choose('Tất cả tỉnh/thành', [['ha noi', 'Hà Nội'], ['da nang', 'Đà Nẵng']]);
  await expect.poll(() => latest('/admin/proposals')?.getAll('status')).toEqual(['GRADING', 'PENDING']);
  await expect.poll(() => latest('/admin/proposals')?.getAll('province')).toEqual(['Hà Nội', 'Đà Nẵng']);
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  await expect.poll(() => latest('/admin/proposals')?.get('page')).toBe('2');
  expect(latest('/admin/proposals').getAll('status')).toEqual(['GRADING', 'PENDING']);
  await page.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
  await expect.poll(() => latest('/admin/proposals')?.getAll('status')).toEqual([]);

  await page.goto('/admin/proposals?tab=requests');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await choose('Tất cả loại yêu cầu', [['cap nhat', 'Yêu cầu cập nhật thông tin'], ['bo sung', 'Yêu cầu bổ sung thông tin']]);
  await choose('Tất cả người phụ trách', [['quan ly a', 'Quản lý A'], ['quan ly b', 'Quản lý B']]);
  await expect.poll(() => latest('/admin/proposal-requests')?.getAll('type')).toEqual(['UPDATE_INFO', 'SUPPLEMENT']);
  await expect.poll(() => latest('/admin/proposal-requests')?.getAll('manager_user_id')).toEqual(['20', '21']);

  await page.goto('/admin/proposals?tab=completed');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await choose('Tất cả trạng thái đề xuất', [['duyet', '14. Đã duyệt BCĐX'], ['huy', 'Đã hủy']]);
  await choose('Tất cả mô hình đầu tư', [['nhuong', 'Nhượng quyền'], ['lien ket', 'Liên kết']]);
  await expect.poll(() => latest('/admin/proposals')?.get('statuses')).toBe('APPROVED,CANCELLED');
  await expect.poll(() => latest('/admin/proposals')?.getAll('model')).toEqual(['NQ', 'LK']);
  expect(latest('/admin/proposals').get('signed_approval_only')).toBe('1');
  await choose('Lọc trạng thái quy trình', [['duyet', '14. Đã duyệt BCĐX']]);
  await expect.poll(() => latest('/admin/proposals')?.getAll('status')).toEqual(['APPROVED']);
  expect(latest('/admin/proposals').get('statuses')).toBe('APPROVED,CANCELLED');
  await page.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
  await expect.poll(() => latest('/admin/proposals')?.getAll('status')).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/proposals');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await choose('Tất cả tỉnh/thành', [['ha noi', 'Hà Nội'], ['da nang', 'Đà Nẵng']]);
  await page.locator('dialog').getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect.poll(() => latest('/admin/proposals')?.getAll('province')).toEqual(['Hà Nội', 'Đà Nẵng']);
  expect(errors).toEqual([]);
});
