const { test, expect } = require('@playwright/test');

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
