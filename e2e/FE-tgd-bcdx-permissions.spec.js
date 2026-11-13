const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('TGĐ sees no BCĐX tasks/upload, retains all-list viewing and approval rejection', async ({ page }) => {
  const errors = [];
  const rejected = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'tgd-bcdx-fixture'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = [];
    let pagination;
    const meta = { roleKey: 'TGD', isAdmin: true, isBackOffice: false };
    const proposal = { id: 101, ma_de_xuat: 'BCDX-TGD-101', user_name: 'Người đề xuất',
      owner_name: 'Người đề xuất', status: 'PROPOSAL_REPORT_REVIEWING', custom_data: {},
      can_upload: false, progress: { requests: [], activity: [] } };
    if (path.endsWith('/auth/me')) data = { user: { id: 7, role: 'ADMIN', full_name: 'TGĐ Fixture',
      custom_data: { department: 'Ban Tổng giám đốc', chuc_vu: 'Tổng giám đốc' } } };
    else if (/\/admin\/proposal-(reports|approvals)$/.test(path)) {
      data = url.searchParams.get('tab') === 'pending' ? [] : [proposal];
      pagination = { page: 1, total: data.length, limit: 20, totalPages: data.length };
    } else if (path.endsWith('/admin/proposal-reports/101')) data = {
      proposal: { ...proposal, status: 'PROPOSAL_REPORT_CREATING' }, permissions: { canUpload: false },
      fieldDefinitions: [], requests: [], activity: [], progress: proposal.progress, meta
    };
    else if (path.endsWith('/admin/proposal-approvals/101')) data = {
      ...proposal, permissions: { canReject: true, canConfigure: false, canRequestUpdate: false }
    };
    else if (path.endsWith('/documents')) data = { documents: [] };
    else if (path.endsWith('/tgd-reject')) {
      rejected.push(route.request().postDataJSON());
      data = { id: 101, status: 'PROPOSAL_REPORT_UPDATING' };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, meta, pagination }) });
  });
  for (const step of ['lap-to-trinh', 'duyet-bcdx']) {
    await page.goto(`/admin/proposals/${step}`);
    await expect(page.locator('tbody').getByText('BCDX-TGD-101', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Tất cả đề xuất', exact: true }).click();
    await expect(page.locator('tbody').getByText('BCDX-TGD-101', { exact: true })).toBeVisible();
  }
  await page.goto('/admin/proposals/lap-to-trinh/101');
  await expect(page.getByRole('button', { name: /Upload|Cập nhật lại|Cập nhật$/ })).toHaveCount(0);
  await page.goto('/admin/proposals/duyet-bcdx/101');
  const reject = page.getByRole('button', { name: 'Từ chối duyệt', exact: true });
  await expect(reject).toBeVisible();
  await expect(page.getByRole('button', { name: /Cấu hình ký|Yêu cầu cập nhật/ })).toHaveCount(0);
  await reject.click();
  await page.locator('textarea').fill('Cần xem lại thông tin BCĐX');
  await page.getByRole('button', { name: 'Từ chối duyệt', exact: true }).last().click();
  await expect.poll(() => rejected.length).toBe(1);
  expect(rejected[0]).toEqual({ reason: 'Cần xem lại thông tin BCĐX' });
  expect(errors).toEqual([]);
});
