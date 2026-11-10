const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE = process.env.ON_WORKFLOW_BASE_URL || 'http://localhost:5186';
const station = {
  id: 1, proposal_id: 11, ma_tram: 'ON-001', ma_de_xuat: 'LK_HNO_1',
  status: 'OPERATING', sub_status: 'ACTIVE', owner_name: 'Chủ trạm kiểm thử', owner_phone: '0901234567',
  contract_status: 'NOT', infra_power_status: 'DONE', infra_site_status: 'NOT', payment_status: 'NOT',
  deposit_status: 'NOT_RECEIVED', cms_station_code: 'CMS-1', on_date: '2026-11-01',
  permissions: { back_office: true, setup: true, finance: true, request_early: true }, proposal: {},
  can_mark_on_station_active: true,
  timeline: [{ id: 1, action: 'portion_start_installation', changed_fields: { deployment_id: 31, quantity: 2,
    acceptance_file_id: null, on_date: null, missing_prerequisites: [], sub_status: { old: 'NOT_INSTALLED', new: 'INSTALLING' } } }]
};
const fulfillment = {
  items: [{ commitment_id: 3, name: 'DC120', model: 'LK', supplier_name: 'Kho A', committed_quantity: 5,
    remaining_quantity: 3, stock_quantity: 2, exported_quantity: 2, received_quantity: 1, returned_quantity: 0, operating_quantity: 1 }],
  totals: { committed: 5, exported: 2, received: 1, returned: 0, remaining: 3, operating: 1 },
  shipments: [
    { id: 10, transport_code: 'SHIP-10', transport_status: 'SHIPPING', items: [{ id: 20, commitment_id: 3, name: 'DC120', quantity: 3, received_quantity: 1, returned_quantity: 0, return_pending_quantity: 0 }] },
    { id: 11, transport_code: 'SHIP-11', transport_status: 'SHIPPING', items: [{ id: 21, commitment_id: 3, name: 'DC120', quantity: 2, received_quantity: 1, returned_quantity: 0, return_pending_quantity: 1 }] }
  ]
};
let portions = [
  { id: 30, quantity: 1, stage: 'OPERATING', sub_status: 'ACTIVE', on_date: '2026-11-01' },
  { id: 31, quantity: 2, stage: 'INSTALLING', sub_status: 'NOT_INSTALLED' },
  { id: 32, quantity: 1, stage: 'CONFIGURING', sub_status: 'NOT_CONFIGURED', acceptance_file_id: 90 },
  { id: 33, quantity: 1, stage: 'ACCEPTANCE', sub_status: 'NOT_ACCEPTED' }
];

async function main() {
  const helper = await import('./src/utils/chargingFulfillment.js');
  assert.equal(helper.canOperateStation({ role: 'ADMIN', department: 'Back Office Setup Vận hành' }, station, 'setup'), false);
  assert.equal(helper.canOperateStation({ role: 'SUPER_ADMIN' }, {}, 'finance'), true);
  assert.deepEqual(helper.deploymentActions(portions[1]), ['start-installation']);
  assert.equal(helper.shipmentAvailable(fulfillment.shipments[0].items[0], 'request-return'), 1);
  assert.throws(() => helper.validateShipmentQuantities([{ id: 3, remaining_quantity: 3, stock_quantity: 2 }], { 3: 3 }, true), /Tồn kho/);
  assert.throws(() => helper.validateShipmentQuantities([{ id: 3 }], { 3: -1 }, true), /không âm/);
  const key = helper.requestKeyForIntent(null, { quantity: 1 });
  assert.equal(helper.requestKeyForIntent(key, { quantity: 1 }).request_id, key.request_id);
  assert.notEqual(helper.requestKeyForIntent(key, { quantity: 2 }).request_id, key.request_id);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const mutations = [];
  let role = 'SUPER_ADMIN';
  let failOnce = true;
  let countCalls = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'mock-on-workflow'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    let data = [];
    if (path === '/auth/me') data = { user: { id: 7, role, full_name: 'Kiểm thử', department: 'Back Office Setup Vận hành' } };
    else if (path === '/assistant/status') data = { enabled: false };
    else if (path === '/admin/charging-stations/task-counts') {
      countCalls++;
      data = { total: 6, counts: { contract: 1, infrastructure: 1, delivery: 1, installation: 1, acceptance: 1, on_station: 1, finance: 1 } };
    } else if (path === '/admin/charging-stations/1/fulfillment') data = fulfillment;
    else if (path === '/admin/charging-stations/1/deployments') data = portions;
    else if (path === '/admin/charging-stations/1') data = station;
    else if (/\/shipments|\/deployments\/\d+\/actions/.test(path) && request.method() === 'POST') {
      mutations.push({ path, body: request.postDataJSON() });
      if (failOnce) {
        failOnce = false;
        return route.fulfill({ status: 503, json: { success: false, message: 'Thử lại cùng thao tác' } });
      }
      data = { station };
    } else if (path === '/admin/charging-stations') data = [{ ...station, fulfillment, deployments: portions }];
    else if (/\/(contract|infrastructure)\//.test(path) && request.method() === 'POST') {
      mutations.push({ path, body: request.postDataJSON() });
      data = station;
    } else if (path === '/files/upload') data = { id: 91, original_name: 'Nghiem-thu.pdf' };
    else if (path === '/admin/charging-finance/stations') data = [station];
    else if (path.includes('/proposal-task-counts')) data = {};
    else if (path.includes('/notifications')) data = { unread_count: 0, notifications: [] };
    return route.fulfill({ json: { success: true, data, pagination: { page: 1, totalPages: 1, total: 1 } } });
  });
  try {
    let contractFont;
    for (const stage of ['khoi-tao-hop-dong', 'thong-tin-chung', 'xay-dung-ha-tang', 'giao-tru', 'lap-tru', 'nghiem-thu', 'on-tram']) {
      await page.goto(`${BASE}/admin/on-tram/${stage}?tab=need`);
      const table = page.locator('table.dynamic-table.proposal-table-compact');
      const code = table.getByRole('link', { name: 'ON-001', exact: true });
      await code.waitFor();
      const font = await code.evaluate((element) => {
        const style = getComputedStyle(element);
        const cell = getComputedStyle(element.closest('td'));
        return { family: style.fontFamily, size: style.fontSize, cellSize: cell.fontSize };
      });
      contractFont ||= font;
      assert.deepEqual(font, contractFont, `Matching fonts: ${stage}`);
      assert.equal(font.size, font.cellSize, `Code inherits table font: ${stage}`);
      assert.equal(await table.locator('tbody td').nth(1).evaluate((cell) => getComputedStyle(cell).position), 'sticky');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await table.evaluate((element) => element.parentElement.scrollWidth > element.parentElement.clientWidth));
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.goto(`${BASE}/admin/on-tram/khoi-tao-hop-dong?tab=need`);
    const contractTable = page.locator('table.dynamic-table.proposal-table-compact');
    await contractTable.getByRole('link', { name: 'ON-001', exact: true }).waitFor();
    assert.equal(await contractTable.locator('thead th').count(), 13);
    assert.equal(await contractTable.locator('tbody tr').count(), 1);
    assert.equal(await contractTable.locator('tbody td').nth(1).evaluate((cell) => getComputedStyle(cell).position), 'sticky');
    assert.equal(await contractTable.getByRole('link', { name: 'LK_HNO_1', exact: true }).getAttribute('href'), '/admin/proposals/chi-tiet/11');
    await contractTable.getByRole('button', { name: 'Đang ký hợp đồng', exact: true }).click();
    await page.getByText('Đã chuyển hợp đồng sang trạng thái Đang ký', { exact: true }).first().waitFor();
    assert.match(mutations.at(-1).path, /contract\/start$/);
    mutations.length = 0;
    await page.goto(`${BASE}/admin/on-tram/giao-tru?tab=all`);
    await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
    await page.getByText('SHIP-10', { exact: false }).waitFor();
    await page.getByText('SHIP-11', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Xuất trụ theo số lượng' }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Tồn kho không đủ' }).first().waitFor();
    assert.equal(mutations.length, 0);
    await page.locator('.modal-box').last().locator('input[type=number]').first().fill('2');
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Thử lại cùng thao tác' }).first().waitFor();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Xuất trụ theo số lượng' }).waitFor();
    assert.equal(mutations[0].body.request_id, mutations[1].body.request_id);
    assert.deepEqual(mutations[1].body.items, [{ commitment_id: 3, quantity: 2 }]);
    await page.getByRole('button', { name: 'Nhận một phần / toàn bộ' }).first().click();
    await page.locator('.modal-box').last().locator('input[type=number]').fill('1');
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Xuất trụ theo số lượng' }).waitFor();
    assert.deepEqual(mutations.at(-1).body.items, [{ item_id: 20, quantity: 1 }]);
    assert.notEqual(mutations.at(-1).body.request_id, mutations[1].body.request_id);
    await page.getByRole('button', { name: 'Yêu cầu trả hàng' }).first().click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByText('Vui lòng nhập lý do', { exact: true }).first().waitFor();
    await page.locator('.modal-box').last().locator('input').last().fill('Trụ lỗi cần đổi');
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Xuất trụ theo số lượng' }).waitFor();
    assert.match(mutations.at(-1).path, /request-return$/);
    await page.getByRole('button', { name: 'Xác nhận hoàn kho thực tế' }).last().click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Xuất trụ theo số lượng' }).waitFor();
    assert.match(mutations.at(-1).path, /confirm-return$/);
    await page.getByRole('button', { name: 'Giao hàng thất bại' }).first().click();
    const beforeFailure = mutations.length;
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByText('Vui lòng nhập lý do', { exact: true }).first().waitFor();
    assert.equal(mutations.length, beforeFailure);
    await page.locator('.modal-box').last().locator('input').last().fill('Không giao được');
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Xuất trụ theo số lượng' }).waitFor();
    assert.match(mutations.at(-1).path, /fail$/);
    await page.goto(`${BASE}/admin/on-tram/lap-tru?tab=need`);
    await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
    await page.getByRole('button', { name: 'Bắt đầu lắp đặt', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Bắt đầu lắp đặt', exact: true }).waitFor();
    assert.equal(mutations.at(-1).body.action, 'start-installation');
    assert.match(mutations.at(-1).path, /deployments\/31\/actions$/);
    await page.goto(`${BASE}/admin/on-tram/on-tram?tab=need`);
    await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
    await page.getByRole('button', { name: 'Hoàn tất ON phần trụ' }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByText('Thiếu điều kiện: phải nhập lý do và xác nhận chấp nhận rủi ro', { exact: true }).first().waitFor();
    await page.locator('.modal-box').last().locator('input').nth(2).fill('ON sớm theo phê duyệt');
    await page.locator('.modal-box').last().locator('input[type=date]').fill('2026-11-10');
    await page.locator('.modal-box').last().locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Hoàn tất ON phần trụ' }).waitFor();
    assert.equal(mutations.at(-1).body.accept_missing, true);
    assert.equal(mutations.at(-1).body.on_date, '2026-11-10');
    assert.equal(station.on_date, '2026-11-01');
    await page.goto(`${BASE}/admin/on-tram/nghiem-thu?tab=need`);
    await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
    await page.getByRole('button', { name: 'Nghiệm thu không đạt', exact: true }).click();
    const beforeReject = mutations.length;
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByText('Vui lòng nhập lý do', { exact: true }).first().waitFor();
    assert.equal(mutations.length, beforeReject);
    await page.locator('.modal-box').last().locator('input').last().fill('Cần sửa đấu nối');
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('button', { name: 'Nghiệm thu đạt', exact: true }).waitFor();
    assert.equal(mutations.at(-1).body.action, 'acceptance-failed');
    await page.getByRole('button', { name: 'Nghiệm thu đạt', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByText('Vui lòng tải biên bản nghiệm thu PDF cho phần trụ này', { exact: true }).first().waitFor();
    await page.locator('input[type=file]').setInputFiles({ name: 'Nghiem-thu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/deployments/33/actions')
        && response.request().method() === 'POST'
        && response.request().postDataJSON()?.action === 'acceptance-passed'),
      page.getByRole('button', { name: 'Xác nhận', exact: true }).click()
    ]);
    await page.getByRole('button', { name: 'Nghiệm thu đạt', exact: true }).waitFor();
    assert.equal(mutations.at(-1).body.acceptance_file_id, 91);
    assert.match(mutations.at(-1).path, /deployments\/33\/actions$/);
    await page.goto(`${BASE}/admin/on-tram/khoi-tao-hop-dong?tab=all`);
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/contract/start')),
      page.getByRole('button', { name: 'Đang ký hợp đồng', exact: true }).click()
    ]);
    assert.match(mutations.at(-1).path, /contract\/start$/);
    await page.goto(`${BASE}/admin/on-tram/xay-dung-ha-tang?tab=all`);
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/infrastructure/site/start')),
      page.getByRole('button', { name: 'Đang hoàn thiện mặt bằng', exact: true }).click()
    ]);
    assert.match(mutations.at(-1).path, /infrastructure\/site\/start$/);
    assert(countCalls > 5, 'mutation events must refresh task counts');
    await page.goto(`${BASE}/admin/on-tram/giao-tru?tab=completed`);
    await page.getByRole('link', { name: 'ON-001', exact: true }).click();
    await page.getByRole('heading', { name: 'Nhật ký hoạt động trạm sạc', exact: true }).waitFor();
    await page.getByText('Phần trụ: 31', { exact: false }).waitFor();
    assert.deepEqual(await page.locator('section > h2').allTextContents(), [
      'Thông tin trạm sạc', 'Trụ chốt, giao hàng và các phần triển khai',
      'Hợp đồng, hạ tầng và tài chính', 'Thông tin chính của đề xuất', 'Nhật ký hoạt động trạm sạc'
    ]);
    await page.getByRole('button', { name: 'Quay lại danh sách' }).click();
    await page.waitForURL('**/giao-tru?tab=completed');
    await page.goto(`${BASE}/admin/on-tram/thong-tin-chung?tab=all`);
    await page.getByRole('link', { name: 'Chi tiết', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Đã ON Trạm', exact: true }).count(), 0);
    role = 'ADMIN';
    await page.goto(`${BASE}/admin/on-tram/giao-tru?tab=all`);
    await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
    await page.getByText('Lịch sử các chuyến giao', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Xuất trụ theo số lượng' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Yêu cầu trả hàng' }).count(), 0);
    await page.goto(`${BASE}/admin/on-tram/lap-tru?tab=need`);
    await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
    await page.getByText('Các phần trụ triển khai', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Bắt đầu lắp đặt', exact: true }).count(), 0);
    await page.goto(`${BASE}/admin/on-tram/khoi-tao-hop-dong?tab=all`);
    await page.getByText('Chỉ xem', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Đang ký hợp đồng', exact: true }).count(), 0);
    await page.goto(`${BASE}/admin/on-tram/xay-dung-ha-tang?tab=all`);
    await page.getByText('Chỉ xem', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Đang hoàn thiện mặt bằng', exact: true }).count(), 0);
    await page.goto(`${BASE}/admin/tai-chinh?tab=all`);
    await page.getByRole('button', { name: 'Thanh toán', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Hoàn tất', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS ON UI: multiple shipments; partial receipt/return; stock errors; stable retries and distinct keys; failure reason; leftover portion actions after first ON; missing-prerequisite acknowledgement; ADMIN read-only; task counts refreshed; no runtime errors.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
