const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('grading detail submits 2+2 and shows the direct-report result', async ({ page }) => {
  const errors = [];
  let submitted;
  let status = 'GRADING';
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'grading-test'));
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/proposal-grading/42') && route.request().method() === 'PUT') {
      submitted = route.request().postDataJSON();
      status = 'PROPOSAL_REPORT_CREATING';
      return route.fulfill({ json: { success: true,
        message: 'Đã cập nhật đánh giá — đề xuất chuyển sang Lập tờ trình BCĐX',
        data: { status, transition: { status } } } });
    }
    const data = pathname.endsWith('/auth/me') ? { user: { id: 1, role: 'SUPER_ADMIN' } }
      : pathname.endsWith('/proposal-grading/42') ? {
        proposal: { id: 42, ma_de_xuat: 'DX-42', status, quy_hoach_score: 2, phap_ly_score: null,
          custom_data: { mo_hinh_dau_tu: 'NQ', chinh_sach_nq: 'Trả thẳng' } },
        fieldDefinitions: [], progress: {}, permissions: { canGradePL: status === 'GRADING' }
      } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/proposals/danh-gia-quy-hoach/42');
  await page.getByRole('button', { name: 'Chấm điểm', exact: true }).click();
  await page.locator('dialog select').selectOption('2');
  await page.getByRole('button', { name: 'Lưu đánh giá', exact: true }).click();
  await expect(page.getByText('Đã cập nhật đánh giá — đề xuất chuyển sang Lập tờ trình BCĐX')).toBeVisible();
  expect(submitted.phap_ly_score).toBe(2);
  await expect(page.getByRole('button', { name: 'Chấm điểm', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
