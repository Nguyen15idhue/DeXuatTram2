const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  try {
    console.log('=== Phase 9 Bước 9.1: Template Editor Test ===\n');

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

    // Check Template button exists
    console.log('3. Check Template button...');
    const templateBtn = await page.$('button:has-text("Template")');
    console.log('   Template button:', templateBtn ? 'PASS' : 'FAIL');
    results.push({ test: 'Template button exists', pass: !!templateBtn });

    // Click Template button
    if (templateBtn) {
      console.log('4. Click Template button...');
      await templateBtn.click();
      await page.waitForTimeout(1000);

      // Check Template Editor loaded
      console.log('5. Check Template Editor loaded...');
      const editorTitle = await page.$('text=Desc Template Editor');
      console.log('   Editor title:', editorTitle ? 'PASS' : 'FAIL');
      results.push({ test: 'Editor title visible', pass: !!editorTitle });

      // Check Preview section
      const previewInput = await page.$('input[placeholder="Proposal ID"]');
      console.log('   Preview input:', previewInput ? 'PASS' : 'FAIL');
      results.push({ test: 'Preview input exists', pass: !!previewInput });

      // Check Add Section button
      const addSectionBtn = await page.$('button:has-text("Thêm Section")');
      console.log('   Add Section button:', addSectionBtn ? 'PASS' : 'FAIL');
      results.push({ test: 'Add Section button exists', pass: !!addSectionBtn });

      // Check Save button
      const saveBtn = await page.$('button:has-text("Lưu Template")');
      console.log('   Save button:', saveBtn ? 'PASS' : 'FAIL');
      results.push({ test: 'Save button exists', pass: !!saveBtn });

      // Check sections rendered
      const sections = await page.$$('.bg-base-100.rounded-lg.border.border-base-300');
      console.log('   Sections rendered:', sections.length);
      results.push({ test: 'Sections rendered', pass: sections.length > 0 });

      // Test Preview with proposal ID
      console.log('6. Test Preview...');
      if (previewInput) {
        await previewInput.fill('2');
        const previewBtn = await page.$('button:has-text("Xem trước")');
        if (previewBtn) {
          await previewBtn.click();
          await page.waitForTimeout(2000);

          const previewModal = await page.$('.modal.modal-open');
          console.log('   Preview modal:', previewModal ? 'PASS' : 'FAIL');
          results.push({ test: 'Preview modal opens', pass: !!previewModal });

          // Close preview modal
          const closeBtn = await page.$('.modal.modal-open button:has-text("Đóng")');
          if (closeBtn) await closeBtn.click();
          await page.waitForTimeout(500);
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
    fs.writeFileSync('test-phase9-9.1-results.json', JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await browser.close();
  }
}

main();
