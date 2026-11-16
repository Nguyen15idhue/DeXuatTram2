const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('completed review detail displays cleared level, retained scores and history without action buttons', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'completed-review-fixture'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const proposal = { id: 1082, ma_de_xuat: 'DX-REVIEW-COMPLETED', status: 'DESIGNING',
      review_level: null, quy_hoach_score: 3, quy_hoach_note: 'Quy hoạch đã chấm lại',
      phap_ly_score: 2, phap_ly_note: 'Pháp lý đã chấm lại', custom_data: {} };
    const data = path.endsWith('/auth/me') ? { user: { id: 1, role: 'SALES',
      custom_data: { department: 'Trung tâm KD miền Bắc', chuc_vu: 'Giám đốc Trung tâm Kinh doanh' } } }
      : path.endsWith('/proposal-reviews/1082') ? {
        proposal, fieldDefinitions: [], requests: [{ id: 10, request_type: 'RE_GRADE', status: 'DONE' }],
        progress: { requests: [], activity: [{ id: 1, action: 'status_change',
          from_status: 'RE_GRADING', to_status: 'DESIGNING' }] },
        permissions: { canRequestRegrade: false, canCancelGdttkd: false, canSubmitToTgd: false,
          canCancelTgd: false, canApproveTgd: false }
      } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/proposals/yeu-cau-cham-diem-lai/1082');
  await expect(page.getByRole('heading', { name: 'Chi tiết yêu cầu chấm điểm lại — DX-REVIEW-COMPLETED', exact: true })).toBeVisible();
  await expect(page.getByText('Quy hoạch đã chấm lại', { exact: true })).toBeVisible();
  await expect(page.getByText('Pháp lý đã chấm lại', { exact: true })).toBeVisible();
  for (const name of ['Yêu cầu đánh giá lại', 'Xác nhận hủy', 'Trình TGĐ xem xét', 'Đồng ý hủy', 'Xác nhận duyệt']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

for (const mobile of [false, true]) {
  test(`regrade organizational permissions and tab navigation: ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors = [];
    const tabs = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('token', 'review-scope-fixture'));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let data = [], pagination, meta;
      if (url.pathname.endsWith('/auth/me')) data = { user: {
        id: 1, role: 'SALES', full_name: 'GĐTTKD Bắc',
        custom_data: { department: 'Trung tâm KD miền Bắc', chuc_vu: 'Giám đốc Trung tâm Kinh doanh' }
      } };
      else if (url.pathname.endsWith('/admin/proposal-reviews')) {
        const tab = url.searchParams.get('tab');
        tabs.push(tab);
        data = [{
          id: 101, ma_de_xuat: 'DX-NHAN-SU-TRUNG', user_id: 3, user_name: 'Người đề xuất miền Bắc',
          status: 'RE_GDTTKD_EVALUATING', review_level: 2,
          custom_data: { vung_mien: 'Trung' },
          permissions: { canSubmitToTgd: true, canCancelGdttkd: true }
        }];
        pagination = { page: 1, total: 1, totalPages: 1, limit: 20 };
        meta = { reviewRole: 'GDTTKD', region: 'Bac', isAdmin: false };
      }
      await route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ success: true, data, pagination, meta }) });
    });
    await page.goto('/admin/proposals/yeu-cau-cham-diem-lai');
    await expect(page.getByRole('button', { name: 'DX-NHAN-SU-TRUNG', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trình TGĐ xem xét', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Các đề xuất đã hoàn thành', exact: true }).click();
    await expect(page.getByRole('button', { name: 'DX-NHAN-SU-TRUNG', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trình TGĐ xem xét', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Tất cả đề xuất', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Trình TGĐ xem xét', exact: true })).toBeVisible();
    await expect(page.locator('a[href="/admin/proposals/yeu-cau-cham-diem-lai"]'))
      .toContainText('1');
    expect(tabs).toEqual(expect.arrayContaining(['pending', 'completed', 'all']));
    expect(errors).toEqual([]);
  });
}
