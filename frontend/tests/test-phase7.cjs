const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const RESULTS_FILE = path.join(__dirname, 'test-phase7-results.json');

async function main() {
  const results = [];
  const browser = await chromium.launch({
    headless: false,
    slowMo: 800
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, status: 'PASS' });
      console.log(`✅ ${name}`);
    } catch (e) {
      results.push({ name, status: 'FAIL', error: e.message });
      console.log(`❌ ${name}: ${e.message}`);
    }
  }

  try {
    await test('Login admin', async () => {
      await page.goto(`${BASE}/login`);
      await page.waitForLoadState('networkidle');
      await page.fill('input[type="email"]', 'admin@station.com');
      await page.fill('input[type="password"]', '123456');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    });

    await test('Navigate to API Configs', async () => {
      await page.goto(`${BASE}/admin/api-configs`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    });

    await test('Click edit on 1Office config', async () => {
      const rows = await page.$$('tr');
      for (const row of rows) {
        const text = await row.textContent();
        if (text.includes('1office')) {
          await row.click();
          break;
        }
      }
      await page.waitForTimeout(1000);
    });

    await test('Preview endpoint works', async () => {
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const res = await page.request.post(`${API}/api/admin/1office/preview`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { apiConfigId: 2, proposalId: 2 }
      });
      const json = await res.json();
      if (!json.success) throw new Error('Preview failed');
      if (!json.data.html) throw new Error('No HTML returned');
      console.log(`   HTML length: ${json.data.html.length} chars`);
    });

    await test('Get template endpoint works', async () => {
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const res = await page.request.get(`${API}/api/admin/1office/template?configId=2`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (!json.success) throw new Error('Get template failed');
      if (!json.data || !json.data.sections) throw new Error('No sections');
      console.log(`   Sections: ${json.data.sections.length}`);
    });

    await test('PUT template works', async () => {
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const template = {
        sections: [
          { id: 'basic', title: 'Thông tin cơ bản', always_show: true, fields: ['owner_name', 'address', 'area'] },
          { id: 'other', title: 'Thông tin khác', always_show: true, collapsible: true, fields: ['description'] },
          { id: 'model_nq', title: 'Nhượng quyền', condition: { field: 'mo_hinh', operator: '=', value: 'NQ' }, fields: ['investment_cost', 'loai_tru'] },
          { id: 'model_tdt', title: 'Tự đầu tư', condition: { field: 'mo_hinh', operator: '=', value: 'TDT' }, fields: ['investment_cost'] },
          { id: 'model_lk', title: 'Liên kết', condition: { field: 'mo_hinh', operator: '=', value: 'LK' }, fields: ['investment_cost'] }
        ]
      };
      const res = await page.request.put(`${API}/api/admin/1office/template`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { configId: 2, template }
      });
      const json = await res.json();
      if (!json.success) throw new Error('PUT template failed: ' + json.message);
    });

    await test('Preview returns correct sections', async () => {
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const res = await page.request.post(`${API}/api/admin/1office/preview`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { apiConfigId: 2, proposalId: 2 }
      });
      const json = await res.json();
      const html = json.data.html;
      if (!html.includes('Thông tin cơ bản')) throw new Error('Missing basic section');
      if (!html.includes('Thông tin khác')) throw new Error('Missing other section');
      if (!html.includes('Nhượng quyền')) throw new Error('Missing NQ section');
      if (html.includes('Tự đầu tư')) throw new Error('TDT section should be skipped');
      if (html.includes('Liên kết')) throw new Error('LK section should be skipped');
      console.log('   Sections rendered correctly');
    });

    await test('Check Swagger docs', async () => {
      await page.goto(`${BASE.replace('5173', '3000')}/api-docs`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const title = await page.title();
      if (!title.includes('Station Management')) throw new Error('Swagger not loaded, title: ' + title);
    });

  } finally {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${RESULTS_FILE}`);
    console.log(`Total: ${results.length} | Pass: ${results.filter(r => r.status === 'PASS').length} | Fail: ${results.filter(r => r.status === 'FAIL').length}`);
    await browser.close();
  }
}

main();
