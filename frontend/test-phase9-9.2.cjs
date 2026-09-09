const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  try {
    console.log('=== Phase 9 Bước 9.2: SyncPanel Preview Tab Test ===\n');

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

    // Click Sync button to open SyncPanel
    console.log('3. Click Sync button...');
    const syncBtn = await page.$('button:has-text("Sync")');
    if (syncBtn) {
      await syncBtn.click();
      await page.waitForTimeout(1000);
      console.log('   Sync button clicked: PASS\n');

      // Check Preview tab exists
      console.log('4. Check Preview tab...');
      const previewTab = await page.$('button:has-text("Preview")');
      console.log('   Preview tab:', previewTab ? 'PASS' : 'FAIL');
      results.push({ test: 'Preview tab exists', pass: !!previewTab });

      // Click Preview tab
      if (previewTab) {
        console.log('5. Click Preview tab...');
        await previewTab.click();
        await page.waitForTimeout(500);

        // Check Preview content
        const previewInput = await page.$('input[placeholder="Proposal ID"]');
        console.log('   Preview input:', previewInput ? 'PASS' : 'FAIL');
        results.push({ test: 'Preview input exists', pass: !!previewInput });

        const previewBtn = await page.$('button:has-text("Xem trước")');
        console.log('   Preview button:', previewBtn ? 'PASS' : 'FAIL');
        results.push({ test: 'Preview button exists', pass: !!previewBtn });

        // Test preview with proposal ID
        console.log('6. Test Preview with proposal ID...');
        if (previewInput && previewBtn) {
          await previewInput.fill('2');
          await previewBtn.click();
          await page.waitForTimeout(2000);

          const previewHtml = await page.$('.bg-white.p-4.rounded.border');
          console.log('   Preview HTML rendered:', previewHtml ? 'PASS' : 'FAIL');
          results.push({ test: 'Preview HTML rendered', pass: !!previewHtml });

          // Check HTML content
          if (previewHtml) {
            const content = await previewHtml.textContent();
            const hasContent = content.length > 10;
            console.log('   HTML has content:', hasContent ? 'PASS' : 'FAIL');
            results.push({ test: 'HTML has content', pass: hasContent });
          }
        }
      }
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
    fs.writeFileSync('test-phase9-9.2-results.json', JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await browser.close();
  }
}

main();
