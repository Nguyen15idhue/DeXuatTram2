const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const fs = require('fs');

const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log('Logged in');

  const token = await page.evaluate(() => localStorage.getItem('token'));

  const configsRes = await page.request.get(`${API}/api/admin/api-configs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const configsJson = await configsRes.json();
  const activeConfig = configsJson.data?.find(c => c.is_active);
  const configId = activeConfig?.id || configsJson.data?.[0]?.id;
  if (!configId) { console.log('No config'); await browser.close(); return; }
  console.log('Config:', configId);

  const propsRes = await page.request.get(`${API}/api/proposals`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const propsJson = await propsRes.json();
  const proposals = propsJson.data || [];
  console.log('Proposals:', proposals.length);
  if (proposals.length === 0) { await browser.close(); return; }

  const testProposals = proposals.slice(0, 3);
  for (const proposal of testProposals) {
    const code = proposal.tracking_code || `ID:${proposal.id}`;
    console.log(`\n--- ${code} ---`);

    const previewRes = await page.request.post(`${API}/api/admin/1office/preview`, {
      headers: { 'Authorization': `Bearer ${token}` },
      data: { proposalId: proposal.id, apiConfigId: configId }
    });
    const previewJson = await previewRes.json();
    const html = previewJson.data?.html || '';
    if (!html) { log(`Preview ${code}`, false, 'Empty'); continue; }

    // Template fields: latitude, longitude, mo_hinh_dau_tu, lk_nguoi_dai_dien, ma_de_xuat
    const expectedLabels = ['Vĩ độ', 'Kinh độ', 'Mô hình đầu tư', 'Người đại diện', 'Mã đề xuất'];
    const found = expectedLabels.filter(l => html.includes(l));
    const missing = expectedLabels.filter(l => !html.includes(l));
    log(`Labels (${code})`, missing.length === 0, missing.length > 0 ? `Missing: ${missing.join(', ')}` : `${found.length}/${expectedLabels.length}`);

    const badPatterns = ['Mo Hinh', 'Nguoi Dai Dien', 'Ma De Xuat', 'Latitude', 'Longitude'];
    const foundBad = badPatterns.filter(p => html.includes(p));
    log(`No corruption (${code})`, foundBad.length === 0, foundBad.length > 0 ? foundBad.join(', ') : 'Clean');

    log(`Colored header (${code})`, html.includes('background:#27ae60') || html.includes('background:#e74c3c'));
    log(`2-col layout (${code})`, html.includes('colspan="2"'));
    log(`Emoji (${code})`, html.includes('📋'));

    const filename = `test-template-${proposal.id}.html`;
    fs.writeFileSync(filename, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${code}</title></head><body style="font-family:Arial;max-width:800px;margin:20px auto;padding:20px">${html}</body></html>`, 'utf8');
    console.log(`  Saved: ${filename}`);
  }

  // Screenshot
  await page.goto(`${BASE}/admin/api-configs`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-admin-page.png', fullPage: true });
  log('Admin page screenshot', true);

  console.log(`\n=== ${results.filter(r => r.pass).length}/${results.length} PASS ===`);
  await browser.close();
}

main().catch(console.error);
