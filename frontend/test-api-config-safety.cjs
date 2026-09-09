const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];
  let n = 0;
  const test = (name, pass) => { n++; results.push({ test: name, pass }); console.log(`  ${pass ? '✅' : '❌'} ${n}. ${name}`); };

  try {
    console.log('=== TEST: API CONFIG SAFETY + RECREATE ===\n');

    // Login
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', 'admin@station.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    test('Login', page.url().includes('/map'));

    // Navigate to API Config
    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check 1Office config exists
    const configCard = await page.$('text=1office');
    test('Config 1Office tồn tại', !!configCard);

    // Check config is active
    const activeBadge = await page.$('.badge-success:has-text("Active")');
    test('Config đang Active', !!activeBadge);

    // Try delete active config (should show error toast)
    console.log('\n--- TEST: Delete active config ---');
    const deleteBtn = await page.$('button.btn-error.btn-outline');
    if (deleteBtn) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      const toast = await page.$('.toast-error');
      test('Toast lỗi hiện khi xóa active config', !!toast);
      if (toast) {
        const msg = await toast.textContent();
        test('Toast message đúng', msg.includes('active') || msg.includes('tắt'));
        console.log(`    Message: ${msg}`);
      }
    }

    // Check delete button still exists (not opening confirm dialog)
    const confirmDialog = await page.$('.modal.modal-open');
    test('ConfirmDialog KHÔNG mở khi xóa active', !confirmDialog);

    // Test disable then delete flow
    console.log('\n--- TEST: Disable then delete ---');

    // Navigate back to API Config
    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Summary
    console.log('\n=== RESULTS ===');
    let passed = 0, failed = 0;
    for (const r of results) { console.log(`  ${r.pass ? '✅' : '❌'} ${r.test}`); if (r.pass) passed++; else failed++; }
    console.log(`\nTotal: ${passed}/${results.length} PASS`);

    const fs = require('fs');
    fs.writeFileSync('test-api-config-safety-results.json', JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await browser.close();
  }
}
main();
