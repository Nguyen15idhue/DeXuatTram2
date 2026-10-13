const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';
const FE = process.env.E2E_BASE_URL || 'http://localhost:5173';

// FE-02: luồng đầy đủ Lead -> 2 Proposal -> 2 Station -> ON.
// Dữ liệu test được GIỮ LẠI có chủ đích để kiểm chứng hành trình (không xóa).
async function login(request) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' }
  });
  const json = await res.json();
  return json.data.token;
}

test.describe('FE-02 lead journey (lead -> 2 proposal -> 2 station -> ON)', () => {
  test('full lifecycle with 2 proposals and 2 stations, journey kept', async ({ request, page }) => {
    const token = await login(request);
    const auth = { Authorization: `Bearer ${token}` };
    const stamp = Date.now();
    const phone = '09' + String(stamp).slice(-8);

    // 1. Tạo Lead (nhập thủ công) -> tự route phòng ban theo vùng
    const createRes = await request.post(`${API}/api/admin/leads`, {
      headers: auth,
      data: { full_name: `E2E Lead ${stamp}`, phone, province: 'Tỉnh Hà Tĩnh', customer_classification: 'Tiềm năng' }
    });
    expect(createRes.ok(), 'tạo lead').toBeTruthy();
    const lead = (await createRes.json()).data;
    expect(lead.journey_id, 'lead có journey').toBeTruthy();

    // 2. Đặt TVBH thành công
    const upd = await request.put(`${API}/api/admin/leads/${lead.id}`, { headers: auth, data: { sales_outcome: 'SUCCESS' } });
    expect(upd.ok(), 'cập nhật sales_outcome').toBeTruthy();

    // 3. Tạo 2 đề xuất từ cùng 1 Lead
    const p1Res = await request.post(`${API}/api/admin/leads/${lead.id}/create-proposal`, {
      headers: auth, data: { latitude: 18.352, longitude: 105.901, mo_hinh_dau_tu: 'TDT', idempotency_key: `e2e-1-${stamp}` }
    });
    const p2Res = await request.post(`${API}/api/admin/leads/${lead.id}/create-proposal`, {
      headers: auth, data: { latitude: 18.353, longitude: 105.902, mo_hinh_dau_tu: 'TDT', idempotency_key: `e2e-2-${stamp}` }
    });
    expect(p1Res.ok(), 'tạo đề xuất 1').toBeTruthy();
    expect(p2Res.ok(), 'tạo đề xuất 2').toBeTruthy();
    const p1 = (await p1Res.json()).data;
    const p2 = (await p2Res.json()).data;
    expect(p1.id).not.toBe(p2.id);

    // 4. Force ký thành công cho cả 2 -> tự tạo trạm
    for (const pid of [p1.id, p2.id]) {
      const r = await request.put(`${API}/api/admin/proposals/${pid}/status`, {
        headers: auth, data: { status: 'CONTRACT_SIGNED', reason: 'E2E force ký', force: true }
      });
      expect(r.ok(), `force CONTRACT_SIGNED ${pid}`).toBeTruthy();
    }

    let journey = (await (await request.get(`${API}/api/admin/leads/${lead.id}/journey`, { headers: auth })).json()).data;
    expect(journey.proposals.length, 'lead có 2 đề xuất').toBe(2);
    const stationIds = journey.proposals.map((p) => p.station_id_resolved || p.station_id).filter(Boolean);
    expect(stationIds.length, '2 đề xuất tạo 2 trạm').toBe(2);
    expect(journey.journey.current_stage).toBe('STATION');

    // 5. Bật cả 2 trạm ACTIVE -> ON
    for (const sid of stationIds) {
      const r = await request.put(`${API}/api/stations/${sid}`, { headers: auth, data: { status: 'ACTIVE' } });
      expect(r.ok(), `station ${sid} ACTIVE`).toBeTruthy();
    }
    journey = (await (await request.get(`${API}/api/admin/leads/${lead.id}/journey`, { headers: auth })).json()).data;
    expect(journey.journey.current_stage, 'journey = ON').toBe('ON');

    // 6. Timeline có đủ mốc chính
    const actions = journey.timeline.map((t) => t.action);
    expect(actions).toContain('lead_created');
    expect(actions).toContain('proposal_created');
    expect(actions.filter((a) => a === 'proposal_created').length).toBe(2);

    // 7. UI: mở Lead -> Hành trình hiển thị rail ON + 2 đề xuất
    await page.goto(`${FE}/login`);
    await page.evaluate((t) => { localStorage.setItem('token', t); localStorage.removeItem('remember_until'); }, token);
    await page.goto(`${FE}/admin/leads/view=${lead.id}`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Hành trình")');
    const modal = page.locator('.modal-open');
    await expect(modal).toContainText('Đề xuất & Trạm (2)');
    await expect(modal.locator('a[href*="/admin/proposals/view="]').first()).toBeVisible();
    await expect(modal.locator('a[href*="/admin/stations/view="]').first()).toBeVisible();
    await page.waitForTimeout(500);

    // Không xóa dữ liệu -> giữ hành trình để HUMAN kiểm chứng.
    console.log(`[FE-02] Lead #${lead.id} (${lead.lead_code}) — 2 proposals [${p1.id}, ${p2.id}] — stations [${stationIds.join(', ')}] — stage=ON`);
  });
});
