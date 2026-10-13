const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Login
  console.log('Logging in...');
  const res = await page.request.post(`${API}/api/auth/login`, { 
    data: { email: 'admin@station.com', password: '123456' } 
  });
  const { data } = await res.json();
  console.log('Login response:', res.status(), data?.message || 'ok');
  
  await page.goto(`${BASE}/admin/api-configs`);
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Check current automations list via API
  console.log('\n--- Testing GET /api/admin/automations ---');
  const listRes = await page.request.get(`${API}/api/admin/automations`, {
    headers: { Authorization: `Bearer ${data.token}` }
  });
  console.log('List status:', listRes.status());
  const listData = await listRes.json();
  console.log('List data:', JSON.stringify(listData, null, 2));
  
  // Test create automation
  console.log('\n--- Testing POST /api/admin/automations (create) ---');
  const createRes = await page.request.post(`${API}/api/admin/automations`, {
    headers: { 
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'application/json'
    },
    data: { 
      automation_key: 'auto_assign_process', 
      name: 'Test Automation', 
      enabled: false 
    }
  });
  console.log('Create status:', createRes.status());
  const createData = await createRes.json();
  console.log('Create data:', JSON.stringify(createData, null, 2));
  
  // Test sync templates
  console.log('\n--- Testing GET /api/admin/automations/sync/templates ---');
  const templatesRes = await page.request.get(`${API}/api/admin/automations/sync/templates`, {
    headers: { Authorization: `Bearer ${data.token}` }
  });
  console.log('Templates status:', templatesRes.status());
  const templatesData = await templatesRes.json();
  console.log('Templates data:', JSON.stringify(templatesData, null, 2));
  
  // Test sync template versions
  console.log('\n--- Testing POST /api/admin/automations/sync/template-versions ---');
  const versionsRes = await page.request.post(`${API}/api/admin/automations/sync/template-versions`, {
    headers: { 
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'application/json'
    },
    data: { process_ids: [] }
  });
  console.log('Versions status:', versionsRes.status());
  const versionsData = await versionsRes.json();
  console.log('Versions data:', JSON.stringify(versionsData, null, 2));
  
  // Test UI - click Automation tab
  console.log('\n--- Testing UI: Click Automation tab ---');
  await page.click('button[role="tab"]:has-text("Automation")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Check if create button exists
  const createBtn = await page.$('button:has-text("Thêm mới")');
  console.log('Create button exists:', !!createBtn);
  
  if (createBtn) {
    await createBtn.click();
    await page.waitForTimeout(1000);
    
    // Fill create form
    await page.fill('input[placeholder="VD: Đồng bộ Sheet đầu tư trạm"]', 'Test New Automation');
    await page.click('button:has-text("Tạo mới")');
    await page.waitForTimeout(2000);
    
    const toast = await page.$('.alert-success, .toast-success, [class*="success"]');
    console.log('Toast after create:', toast ? await toast.textContent() : 'none');
    
    const errorToast = await page.$('.alert-error, .toast-error, [class*="error"]');
    console.log('Error toast:', errorToast ? await errorToast.textContent() : 'none');
  }
  
  // Test Sync Sheet tab
  console.log('\n--- Testing UI: Click Sync Sheet automation ---');
  const syncCard = await page.$('button:has-text("Sync Sheet")');
  if (syncCard) {
    await syncCard.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Click config tab if not active
    const configTab = await page.$('button[role="tab"]:has-text("Cấu hình chung")');
    if (configTab) {
      await configTab.click();
      await page.waitForTimeout(1000);
    }
    
    // Click Get button
    const getBtn = await page.$('button:has-text("Get")');
    console.log('Get button exists:', !!getBtn);
    
    if (getBtn) {
      await getBtn.click();
      await page.waitForTimeout(3000);
      
      // Check if template processes loaded
      const select = await page.$('select[multiple]');
      if (select) {
        const options = await select.$$('option');
        console.log('Template process options count:', options.length);
        for (const opt of options) {
          console.log('  Option:', await opt.textContent());
        }
      }
    }
  }
  
  await browser.close();
}

main().catch(console.error);