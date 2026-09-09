const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

const PROPOSALS = [
  {
    name: 'Nhượng quyền (NQ)',
    data: {
      owner_name: 'Nguyễn Văn A', owner_phone: '0912345678',
      address: '123 Đường Lê Lợi, Quận 1, TP.HCM',
      latitude: 10.7769, longitude: 106.7009, area: '200',
      land_type: 'Đất thương mại',
      description: 'Đề xuất trạm sạc xe điện khu vực trung tâm Quận 1.',
      province: 'Tp Hồ Chí Minh',
      mo_hinh_dau_tu: 'NQ', investment_cost: 500000000,
      nguon_dien: 'Grid', dien_tich_mat_bang: 150,
      nq_gia_niem_yet: 2500, nq_gia_uu_dai: 2000,
      nq_ten_khach_hang: 'Công ty CP ABC', nq_mst: '0123456789',
      nq_nguoi_dai_dien: 'Trần Thị B', nq_sdt: '0987654321',
      nq_so_tai_khoan: '1234567890', nq_chia_loi_nhuan_tmt: 1500, nq_chia_loi_nhuan_nq: 1000,
      nq_thanh_toan_lan_1: 30, nq_thanh_toan_lan_2: 40, nq_thanh_toan_lan_3: 30
    }
  },
  {
    name: 'Tự đầu tư (TDT)',
    data: {
      owner_name: 'Lê Hoàng C', owner_phone: '0901234567',
      address: '456 Đường Nguyễn Huệ, Quận 3, TP.HCM',
      latitude: 10.7832, longitude: 106.6945, area: '500',
      land_type: 'Đất hỗn hợp',
      description: 'Dự án trạm sạc tự đầu tư quy mô lớn tại Quận 3.',
      province: 'Tp Hồ Chí Minh',
      mo_hinh_dau_tu: 'TDT', investment_cost: 1200000000,
      nguon_dien: 'Grid', dien_tich_mat_bang: 400,
      tdt_tru_ccs2_60kw_sl: 5, tdt_tru_ccs2_60kw_dg: 150000000,
      tdt_tru_ccs2_120kw_sl: 3, tdt_tru_ccs2_120kw_dg: 250000000,
      tdt_chi_phi_van_chuyen: 20000000, tdt_chi_phi_tba: 50000000,
      tdt_chi_phi_ha_tang: 80000000, tdt_chi_phi_thue_vi_tri: 30000000
    }
  },
  {
    name: 'Liên kết (LK)',
    data: {
      owner_name: 'Hoàng Thị E', owner_phone: '0923456789',
      address: '789 Đường Hai Bà Trưng, Bình Thạnh, TP.HCM',
      latitude: 10.8015, longitude: 106.7107, area: '350',
      land_type: 'Đất công',
      description: 'Đề xuất trạm sạc liên kết với đối tác chiến lược.',
      province: 'Tp Hồ Chí Minh',
      mo_hinh_dau_tu: 'LK', investment_cost: 800000000,
      nguon_dien: 'Grid', dien_tich_mat_bang: 280,
      lk_ten_phap_nhan: 'Công ty CP Năng lượng Xanh', lk_mst: '9876543210',
      lk_nguoi_dai_dien: 'Vũ Thanh F', lk_sdt: '0934567890',
      lk_dia_chi_dkkd: '789 Đường Hai Bà Trưng, Bình Thạnh',
      lk_ty_le_tmt: 60, lk_ty_le_doi_tac: 40,
      lk_chia_loi_nhuan_tmt: 1200, lk_chia_loi_nhuan_lk: 800
    }
  }
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log('=== LOGGED IN ===');
  const token = await page.evaluate(() => localStorage.getItem('token'));

  const createdIds = [];
  for (const prop of PROPOSALS) {
    console.log(`\n--- Creating: ${prop.name} ---`);
    try {
      const res = await page.request.post(`${API}/api/proposals`, {
        headers: { 'Authorization': `Bearer ${token}` },
        data: prop.data
      });
      const json = await res.json();
      if (json.success && json.data) {
        createdIds.push(json.data.id);
        log(`Create ${prop.name}`, true, `ID: ${json.data.id}`);
      } else {
        log(`Create ${prop.name}`, false, json.message || 'Error');
      }
    } catch (err) {
      log(`Create ${prop.name}`, false, err.message);
    }
  }
  console.log(`\nCreated: ${createdIds.length}/3 — IDs: ${createdIds.join(', ')}`);

  // Preview each proposal
  for (let i = 0; i < PROPOSALS.length; i++) {
    const prop = PROPOSALS[i];
    const propId = createdIds[i];
    if (!propId) continue;
    console.log(`\n--- Preview: ${prop.name} (ID: ${propId}) ---`);
    try {
      const res = await page.request.post(`${API}/api/admin/1office/preview`, {
        headers: { 'Authorization': `Bearer ${token}` },
        data: { proposalId: propId, apiConfigId: 3 }
      });
      const json = await res.json();
      const html = json.data?.html || '';
      if (html) {
        log(`Preview ${prop.name}`, true, `${html.length} chars`);
        const filename = `test-preview-${prop.data.mo_hinh_dau_tu}.html`;
        fs.writeFileSync(filename, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${prop.name}</title></head><body style="font-family:Arial;max-width:800px;margin:20px auto;padding:20px"><h2>${prop.name}</h2>${html}</body></html>`, 'utf8');
      } else {
        log(`Preview ${prop.name}`, false, 'Empty');
      }
    } catch (err) {
      log(`Preview ${prop.name}`, false, err.message);
    }
  }

  // Cleanup
  for (const id of createdIds) {
    try { await page.request.delete(`${API}/api/admin/proposals/${id}`, { headers: { 'Authorization': `Bearer ${token}` } }); } catch {}
  }

  console.log(`\n=== RESULTS: ${results.filter(r => r.pass).length}/${results.length} PASS ===`);
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  fs.writeFileSync('test-proposals-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch(console.error);
