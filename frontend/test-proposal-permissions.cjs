const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = 'http://proposal-permissions.test';
const build = path.resolve(process.env.PROPOSAL_PERMISSIONS_BUILD_DIR || 'dist');
const proposal = {
  id: 101, user_id: 99, ma_de_xuat: 'TEST_PERMISSION_101', owner_name: 'Fixture',
  status: 'GDTTKD_EVALUATING', review_level: 1, custom_data: { vung_mien: 'Bac' },
  quy_hoach_score: 1, phap_ly_score: 2, permissions: {}
};
const scenarios = [
  { role: 'ADMIN', department: 'Phòng Setup và Vận hành', chuc_vu: 'Trưởng phòng', reviewRole: null },
  { role: 'ADMIN', department: 'Phòng Chiến lược KD', chuc_vu: 'Chuyên viên Chiến lược Kinh doanh', reviewRole: 'PL' },
  { role: 'ADMIN', department: 'Trung tâm KD miền Bắc', chuc_vu: 'Giám đốc Trung tâm Kinh doanh', reviewRole: 'GDTTKD' }
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  let checks = 0;
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      let sameRegion = true;
      let ownReport = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('token', 'mock-permissions-only'));
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/')) {
          if (url.origin !== BASE) return route.abort();
          let filename = path.resolve(build, `.${decodeURIComponent(url.pathname)}`);
          assert.ok(filename.startsWith(`${build}${path.sep}`));
          if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = path.join(build, 'index.html');
          const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
          return route.fulfill({ contentType: mime[path.extname(filename)] || 'application/octet-stream', body: fs.readFileSync(filename) });
        }
        assert.equal(request.method(), 'GET', `Unexpected mutation: ${url.pathname}`);
        const endpoint = url.pathname.replace(/^\/api/, '');
        let data = [];
        let meta = {};
        let total = 0;
        const canReview = scenario.reviewRole === 'GDTTKD' && sameRegion;
        const row = { ...proposal, permissions: { canRequestRegrade: canReview, canCancelGdttkd: canReview } };
        if (endpoint === '/auth/me') data = { user: { id: 2, full_name: 'Permission fixture', ...scenario, custom_data: scenario } };
        else if (endpoint === '/assistant/status') data = { enabled: false };
        else if (endpoint.includes('/notifications')) data = { unread_count: 0, notifications: [] };
        else if (endpoint.endsWith('/filter-options')) data = { owners: [], managers: [], provinces: [], regions: [], models: [], workScopes: [] };
        else if (endpoint === '/admin/proposal-reviews') {
          const pending = url.searchParams.get('tab') === 'pending';
          data = !pending || canReview ? [row] : [];
          total = data.length;
          meta = { isAdmin: true, isSuperAdmin: false, reviewRole: scenario.reviewRole };
        } else if (endpoint === '/admin/proposal-reports/101') {
          data = { proposal: { ...proposal, status: 'PROPOSAL_REPORT_CREATING' }, fieldDefinitions: [], progress: {}, permissions: { canUpload: ownReport || canReview } };
        } else if (endpoint.endsWith('/documents')) data = { documents: [] };
        else if (endpoint === '/admin/proposal-approvals/101') {
          data = { ...proposal, status: 'PROPOSAL_REPORT_REVIEWING', permissions: { canConfigure: false, canRequestUpdate: false, canReject: false } };
        } else if (endpoint === '/admin/proposal-layouts') {
          data = url.searchParams.get('tab') === 'pending' ? [] : [{ ...proposal, status: 'DESIGNING', can_manage: false }];
          total = data.length;
          meta = { canManage: false, isAdmin: true };
        } else if (endpoint === '/admin/charging-stations/task-counts') data = { total: 0, counts: {} };
        return route.fulfill({ json: { success: true, data, meta, pagination: { total, page: 1, limit: 20, totalPages: total ? 1 : 0 } } });
      });

      await page.goto(`${BASE}/admin/proposals/yeu-cau-cham-diem-lai?tab=all`);
      await page.getByRole('button', { name: proposal.ma_de_xuat, exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Yêu cầu đánh giá lại', exact: true }).count(), scenario.reviewRole === 'GDTTKD' ? 1 : 0);
      assert.equal(await page.getByRole('button', { name: 'Trình TGĐ xem xét', exact: true }).count(), 0);
      checks += 2;
      if (scenario.reviewRole === 'GDTTKD') {
        sameRegion = false;
        await page.reload();
        await page.getByRole('button', { name: proposal.ma_de_xuat, exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Yêu cầu đánh giá lại', exact: true }).count(), 0);
        checks++;
      }

      await page.goto(`${BASE}/admin/proposals/yeu-cau-cham-diem-lai?tab=pending`);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByRole('button', { name: proposal.ma_de_xuat, exact: true }).count(), 0);
      checks++;

      await page.goto(`${BASE}/admin/proposals/lap-to-trinh/101`);
      await page.getByRole('heading', { name: `Chi tiết đề xuất ${proposal.ma_de_xuat}` }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Cập nhật', exact: true }).count(), 0);
      checks++;
      if (scenario.reviewRole !== 'GDTTKD') {
        ownReport = true;
        await page.reload();
        await page.getByRole('heading', { name: `Chi tiết đề xuất ${proposal.ma_de_xuat}` }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Cập nhật', exact: true }).count(), 1);
        checks++;
      }

      await page.goto(`${BASE}/admin/proposals/duyet-bcdx/101`);
      await page.getByRole('heading', { name: proposal.ma_de_xuat }).waitFor();
      for (const name of ['Cấu hình ký', 'Yêu cầu cập nhật thông tin', 'Từ chối duyệt']) {
        assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
        checks++;
      }
      await page.goto(`${BASE}/admin/proposals/danh-gia-layout?tab=all`);
      await page.getByRole('button', { name: proposal.ma_de_xuat, exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Cập nhật', exact: true }).count(), 0);
      assert.deepEqual(errors, []);
      checks += 2;
      await context.close();
    }
    console.log(`PASS: ${checks} proposal permission UI assertions across Setup, Strategy and regional director profiles`);
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
