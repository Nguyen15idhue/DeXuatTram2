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

test('GĐTTKD report list reflects scoped tasks and ADMIN read-only rows', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'report-scope-fixture'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const role = await page.evaluate(() => sessionStorage.getItem('reportFixtureRole'));
    let data = [];
    let pagination;
    const meta = { roleKey: 'GDTTKD', isAdmin: role === 'ADMIN', isBackOffice: false };
    if (url.pathname.endsWith('/auth/me')) {
      data = { user: { id: 7, role: role || 'SALES', full_name: 'GĐTTKD',
        custom_data: { department: 'Trung tâm KD miền Trung', chuc_vu: 'Giám đốc Trung tâm Kinh doanh' } } };
    } else if (url.pathname.endsWith('/admin/proposal-reports')) {
      data = [{ id: 101, ma_de_xuat: 'TRONG-NHANH', status: 'PROPOSAL_REPORT_CREATING', can_upload: true, custom_data: {} }];
      if (role === 'ADMIN' && url.searchParams.get('tab') === 'all') {
        data.push({ id: 102, ma_de_xuat: 'NGOAI-NHANH', status: 'PROPOSAL_REPORT_CREATING', can_upload: false, custom_data: {} });
      }
      pagination = { page: 1, total: data.length, limit: 20, totalPages: 1 };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, meta, pagination }) });
  });

  await page.goto('/admin/proposals/lap-to-trinh');
  await expect(page.locator('tbody').getByText('TRONG-NHANH', { exact: true })).toBeVisible();
  await expect(page.locator('tbody').getByText('NGOAI-NHANH', { exact: true })).toHaveCount(0);
  await expect(page.locator('tbody tr').filter({ hasText: 'TRONG-NHANH' }).getByRole('button', { name: /Cập nhật/ })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('reportFixtureRole', 'ADMIN'));
  await page.reload();
  await page.getByRole('tab', { name: 'Tất cả đề xuất', exact: true }).click();
  const foreignRow = page.locator('tbody tr').filter({ hasText: 'NGOAI-NHANH' });
  await expect(foreignRow).toBeVisible();
  await expect(foreignRow.getByRole('button', { name: /Cập nhật/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const role of ['ADMIN', 'SALES']) {
  test(`Back Office ${role} can start an unrelated report from the task list`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('token', 'report-backoffice-fixture'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path.endsWith('/auth/me')) data = { user: { id: 6, role, full_name: 'Back Office',
        custom_data: { department: 'Back Office' } } };
      else if (path.endsWith('/admin/proposal-reports')) data = [{
        id: 101, ma_de_xuat: 'NGOAI-NHANH', status: 'PROPOSAL_REPORT_CREATING', can_upload: true, custom_data: {}
      }];
      else if (path.endsWith('/generation-options')) data = { templates: [] };
      else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], provinces: [], models: [], regions: [] };
      await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, limit: 20, totalPages: 1 } } });
    });
    await page.goto('/admin/proposals/lap-to-trinh?tab=pending');
    const row = page.locator('tbody tr').filter({ hasText: 'NGOAI-NHANH' });
    await expect(row.getByRole('button', { name: 'Cập nhật' })).toBeVisible();
    await row.getByRole('button', { name: 'Xem thử mẫu' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
