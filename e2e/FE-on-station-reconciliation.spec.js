const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const failed of [false, true]) {
  test(`general ON station list ${failed ? 'keeps API error visible' : 'shows raw committed poles without requiring inventory mapping'}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', cause => errors.push(cause.message));
    const message = 'Không xác định duy nhất được loại trụ ở dòng 1; cần đối soát thủ công';
    await page.route('**/api/**', async route => {
      const { pathname } = new URL(route.request().url());
      let data = {};
      if (pathname.endsWith('/auth/me')) data = { user: { id: 1, full_name: 'UI Test', role: 'SUPER_ADMIN' } };
      else if (pathname.endsWith('/charging-stations')) {
        if (failed) return route.fulfill({ status: 409, contentType: 'application/json',
          body: JSON.stringify({ success: false, message }) });
        data = [
          { id: 501, ma_tram: 'LEGACY-501', status: 'ONBOARDING', proposal_id: 77,
            chot_so_luong_tru: [{ mo_hinh: 'LK', so_luong: 2, loai_tru: 'LEGACY-DC60' }],
            fulfillment: { needs_review: true, review_message: message, items: [], shipping_options: [] },
            can_mark_on_station_active: false },
          { id: 502, ma_tram: 'VALID-502', status: 'ONBOARDING', proposal_id: 78,
            fulfillment: { needs_review: false, items: [] }, can_mark_on_station_active: true }
        ];
      }
      await route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ success: true, data, pagination: { page: 1, total: 2, totalPages: 1 } }) });
    });
    await page.addInitScript(() => localStorage.setItem('token', 'reconciliation-test'));
    await page.goto('/admin/on-tram/thong-tin-chung');
    if (failed) {
      await expect(page.getByRole('alert').filter({ hasText: message }).first()).toBeVisible();
      await page.waitForTimeout(5500);
      await expect(page.getByRole('alert').filter({ hasText: message }).first()).toBeVisible();
    } else {
      const legacy = page.locator('tbody tr').filter({ hasText: 'LEGACY-501' });
      await expect(legacy).toBeVisible();
      await expect(legacy.getByText('LK · 2 × LEGACY-DC60', { exact: true })).toBeVisible();
      await expect(legacy.getByRole('button', { name: 'Đã ON Trạm', exact: true })).toHaveCount(0);
      await expect(page.locator('tbody tr').filter({ hasText: 'VALID-502' })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
