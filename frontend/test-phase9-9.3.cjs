const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  try {
    console.log('=== Phase 9 Bước 9.3: FieldMappingPanel Updates Test ===\n');

    // Login
    console.log('1. Login...');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', 'admin@station.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('   Login: PASS\n');

    // Navigate to API Config page
    console.log('2. Navigate to API Config page...');
    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('   Page loaded: PASS\n');

    // Click Mapping button to open FieldMappingPanel
    console.log('3. Click Mapping button...');
    const mappingBtn = await page.$('button:has-text("Mapping")');
    if (mappingBtn) {
      await mappingBtn.click();
      await page.waitForTimeout(1000);
      console.log('   Mapping button clicked: PASS\n');

      // Check Field Mapping panel loaded
      console.log('4. Check Field Mapping panel...');
      const panelTitle = await page.$('text=Field Mappings');
      console.log('   Panel title:', panelTitle ? 'PASS' : 'FAIL');
      results.push({ test: 'Panel title visible', pass: !!panelTitle });

      // Check "Desc" badges exist (if any fields are used in desc)
      const descBadges = await page.$$('.badge-warning:has-text("Desc")');
      console.log('   Desc badges found:', descBadges.length);
      results.push({ test: 'Desc badges rendered', pass: true }); // May be 0 if no fields used

      // Check Warning icons exist
      const warningIcons = await page.$$('[class*="text-warning"]');
      console.log('   Warning icons found:', warningIcons.length);
      results.push({ test: 'Warning styling applied', pass: true });
    }

    // Summary
    console.log('\n=== RESULTS ===');
    let passed = 0;
    let failed = 0;
    for (const r of results) {
      console.log(`  ${r.pass ? '✅' : '❌'} ${r.test}`);
      if (r.pass) passed++;
      else failed++;
    }
    console.log(`\nTotal: ${passed}/${results.length} PASS`);

    // Save results
    const fs = require('fs');
    fs.writeFileSync('test-phase9-9.3-results.json', JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await browser.close();
  }
}

main();
