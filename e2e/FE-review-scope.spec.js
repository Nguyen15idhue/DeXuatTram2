const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const detailPage of [false, true]) {
  test(`prepopulates an editable regrading reason before presenting to TGĐ from ${detailPage ? 'detail' : 'list'}`, async ({ page }) => {
    let submitted;
    await page.addInitScript(() => localStorage.setItem('token', 'review-prefill-fixture'));
    await page.route('**/api/**', async route => {
      const { pathname } = new URL(route.request().url());
      const proposal = { id: 101, ma_de_xuat: 'DX-101', status: 'RE_GDTTKD_EVALUATING',
        review_level: 2, custom_data: {}, permissions: { canSubmitToTgd: true } };
      if (pathname.endsWith('/proposal-reviews/101/to-tgd')) {
        submitted = route.request().postDataJSON();
        return route.fulfill({ json: { success: true, data: {}, message: 'Đã trình TGĐ' } });
      }
      const data = pathname.endsWith('/auth/me') ? { user: { id: 1, role: 'SUPER_ADMIN' } }
        : pathname.endsWith('/proposal-reviews/101') ? {
          proposal, fieldDefinitions: [], permissions: { canSubmitToTgd: true },
          requests: [
            { id: 1, request_type: 'RE_GRADE', current_status: 'RE_GRADING', description: 'Lý do cũ' },
            { id: 2, request_type: 'RE_GRADE', current_status: 'RE_GRADING', description: 'Lý do chấm lại mới' },
            { id: 3, request_type: 'RE_GRADE', current_status: 'GDTTKD_EVALUATING', description: 'Tác vụ tự động' }
          ], progress: { requests: [], activity: [] }
        } : pathname.endsWith('/proposal-reviews') ? [proposal] : [];
      await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } } });
    });
    await page.goto(detailPage ? '/admin/proposals/yeu-cau-cham-diem-lai/101' : '/admin/proposals/yeu-cau-cham-diem-lai');
    await page.getByRole('button', { name: 'Trình TGĐ xem xét', exact: true }).click();
    const dialog = page.locator('dialog.modal-open');
    const reason = dialog.locator('textarea');
    await expect(reason).toHaveValue('Lý do chấm lại mới');
    await reason.fill('Lý do đã chỉnh sửa');
    await dialog.getByRole('button', { name: 'Trình TGĐ', exact: true }).click();
    await expect.poll(() => submitted?.reason).toBe('Lý do đã chỉnh sửa');
  });
}

test('review list reports failure loading the default reason and allows manual input', async ({ page }) => {
  let submitted;
  await page.addInitScript(() => localStorage.setItem('token', 'review-prefill-error'));
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/proposal-reviews/101/to-tgd')) {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, data: {} } });
    }
    if (pathname.endsWith('/proposal-reviews/101')) {
      return route.fulfill({ status: 500, json: { success: false, message: 'Không thể tải' } });
    }
    const data = pathname.endsWith('/auth/me') ? { user: { id: 1, role: 'SUPER_ADMIN' } }
      : pathname.endsWith('/proposal-reviews') ? [{ id: 101, status: 'RE_GDTTKD_EVALUATING',
        review_level: 2, permissions: { canSubmitToTgd: true } }] : [];
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } } });
  });
  await page.goto('/admin/proposals/yeu-cau-cham-diem-lai');
  await page.getByRole('button', { name: 'Trình TGĐ xem xét', exact: true }).click();
  const dialog = page.locator('dialog.modal-open');
  await expect(dialog.getByText('Không tải được lý do yêu cầu chấm lại: Không thể tải. Vui lòng nhập lý do thủ công.')).toBeVisible();
  await dialog.locator('textarea').fill('Lý do nhập tay');
  await dialog.getByRole('button', { name: 'Trình TGĐ', exact: true }).click();
  await expect.poll(() => submitted?.reason).toBe('Lý do nhập tay');
});

test('a late response from a closed dialog cannot overwrite another proposal or typed reason', async ({ page }) => {
  let releaseFirst;
  const firstResponse = new Promise(resolve => { releaseFirst = resolve; });
  let firstStarted = false;
  await page.addInitScript(() => localStorage.setItem('token', 'review-prefill-race'));
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/proposal-reviews/101')) {
      firstStarted = true;
      await firstResponse;
      return route.fulfill({ json: { success: true, data: { requests: [
        { request_type: 'RE_GRADE', current_status: 'RE_GRADING', description: 'Lý do đề xuất đầu' }
      ] } } });
    }
    const data = pathname.endsWith('/auth/me') ? { user: { id: 1, role: 'SUPER_ADMIN' } }
      : pathname.endsWith('/proposal-reviews/102') ? { requests: [], progress: { activity: [] } }
        : pathname.endsWith('/proposal-reviews') ? [101, 102].map(id => ({
          id, ma_de_xuat: `DX-${id}`, status: 'RE_GDTTKD_EVALUATING', review_level: 2,
          permissions: { canSubmitToTgd: true }
        })) : [];
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 2, totalPages: 1 } } });
  });
  await page.goto('/admin/proposals/yeu-cau-cham-diem-lai');
  await page.getByRole('row').filter({ hasText: 'DX-101' }).getByRole('button', { name: 'Trình TGĐ xem xét' }).click();
  await expect.poll(() => firstStarted).toBe(true);
  const dialog = page.locator('dialog.modal-open');
  await expect(dialog.locator('textarea')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'DX-102' }).getByRole('button', { name: 'Trình TGĐ xem xét' }).click();
  const reason = dialog.locator('textarea');
  await expect(reason).toBeEnabled();
  await expect(reason).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Trình TGĐ', exact: true })).toBeDisabled();
  await reason.fill('Lý do nhập cho đề xuất thứ hai');
  const firstDone = page.waitForResponse(response => response.url().endsWith('/proposal-reviews/101'));
  releaseFirst();
  await firstDone;
  await expect(reason).toHaveValue('Lý do nhập cho đề xuất thứ hai');
});

test('review detail shows the latest actual reasons above scores and retains multiline text', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'review-reasons-fixture'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/me') ? { user: { id: 1, role: 'SUPER_ADMIN' } }
      : path.endsWith('/proposal-reviews/1082') ? {
        proposal: { id: 1082, status: 'TGD_REVIEW', review_level: 3, custom_data: {} },
        fieldDefinitions: [],
        requests: [
          { id: 1, request_type: 'RE_GRADE', current_status: 'RE_GRADING', description: 'Lý do cũ' },
          { id: 2, request_type: 'RE_GRADE', current_status: 'RE_GRADING', description: 'Lý do mới\nDòng thứ hai' },
          { id: 3, request_type: 'RE_GRADE', current_status: 'RE_GRADING', description: 'Lý do mới\nDòng thứ hai' },
          { id: 4, request_type: 'RE_GRADE', current_status: 'GDTTKD_EVALUATING', description: 'Tác vụ tự động' },
          { id: 5, request_type: 'TGD_REVIEW', description: 'Lý do trình TGĐ' }
        ],
        progress: { requests: [], activity: [] }, permissions: {}
      } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/proposals/yeu-cau-cham-diem-lai/1082');
  const reasons = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lý do xem xét' }) });
  await expect(reasons.getByText('Lý do mới Dòng thứ hai')).toBeVisible();
  await expect(reasons.getByText('Lý do trình TGĐ', { exact: true })).toBeVisible();
  await expect(reasons.getByText('Tác vụ tự động')).toHaveCount(0);
  await expect(reasons.getByText('Lý do cũ')).toHaveCount(0);
  await expect(reasons.locator('span').filter({ hasText: 'Lý do mới' })).toHaveCSS('white-space', 'pre-wrap');
  expect(await reasons.evaluate(element => element.nextElementSibling?.querySelector('h2')?.textContent.trim()))
    .toBe('Kết quả chấm Quy hoạch và Pháp lý');
  expect(errors).toEqual([]);
});

test('review detail uses action history for missing requests and does not mistake automatic tasks for regrading', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'review-history-fixture'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/me') ? { user: { id: 1, role: 'SUPER_ADMIN' } }
      : path.endsWith('/proposal-reviews/1083') ? {
        proposal: { id: 1083, status: 'TGD_REVIEW', custom_data: {} }, fieldDefinitions: [],
        requests: [
          { id: 1, request_type: 'RE_GRADE', current_status: 'GDTTKD_EVALUATING', description: 'Tác vụ tự động' },
          { id: 2, request_type: 'TGD_REVIEW', description: 'Lý do cũ', created_at: '2026-01-01T00:00:00Z' }
        ],
        progress: { requests: [], activity: [
          { id: 1, action: 'review_to_tgd', reject_reason: 'Lý do từ nhật ký', created_at: '2026-01-02T00:00:00Z' }
        ] }, permissions: {}
      } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/proposals/yeu-cau-cham-diem-lai/1083');
  const reasons = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lý do xem xét' }) });
  await expect(reasons.getByText('Chưa có', { exact: true })).toBeVisible();
  await expect(reasons.getByText('Lý do từ nhật ký', { exact: true })).toBeVisible();
  await expect(reasons.getByText('Tác vụ tự động')).toHaveCount(0);
});

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
