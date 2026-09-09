const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];
  let testNum = 0;

  const test = (name, pass) => {
    testNum++;
    results.push({ test: name, pass });
    console.log(`  ${pass ? '✅' : '❌'} ${testNum}. ${name}`);
  };

  try {
    console.log('=== PHASE 9 — FRONTEND TEMPLATE EDITOR — COMPREHENSIVE TEST ===\n');

    // ========== LOGIN ==========
    console.log('--- LOGIN ---');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', 'admin@station.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    const url = page.url();
    test('Login thành công (redirect to map)', url.includes('/map') || url.includes('/admin'));
    console.log('');

    // ========== NAVIGATE TO API CONFIG ==========
    console.log('--- NAVIGATE TO API CONFIG ---');
    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const pageTitle = await page.textContent('h1');
    test('Trang API Configurations load', pageTitle?.includes('API'));
    console.log('');

    // ========== BƯỚC 9.1: TEMPLATE EDITOR ==========
    console.log('--- BƯỚC 9.1: TEMPLATE EDITOR ---');

    // Check Template button
    const templateBtn = await page.$('button:has-text("Template")');
    test('Nút "Template" tồn tại', !!templateBtn);

    // Click Template button
    if (templateBtn) {
      await templateBtn.click();
      await page.waitForTimeout(1500);

      // Check editor loaded
      const editorTitle = await page.$('text=Desc Template Editor');
      test('Template Editor title hiển thị', !!editorTitle);

      // Check Preview section
      const previewInput = await page.$('input[placeholder="Proposal ID"]');
      test('Preview input tồn tại', !!previewInput);

      const previewBtn = await page.$('button:has-text("Xem trước")');
      test('Nút "Xem trước" tồn tại', !!previewBtn);

      // Check Add Section button
      const addSectionBtn = await page.$('button:has-text("Thêm Section")');
      test('Nút "Thêm Section" tồn tại', !!addSectionBtn);

      // Check Save button
      const saveBtn = await page.$('button:has-text("Lưu Template")');
      test('Nút "Lưu Template" tồn tại', !!saveBtn);

      // Check sections rendered
      const sections = await page.$$('.bg-base-100.rounded-lg.border.border-base-300');
      test(`Sections render (${sections.length} sections)`, sections.length > 0);

      // Check section titles
      const sectionTitles = await page.$$eval('input[placeholder="Section title"]', els => els.map(e => e.value));
      test('Section titles render', sectionTitles.length > 0);
      console.log(`    Sections: ${sectionTitles.join(', ')}`);

      // Check Always checkbox
      const alwaysCheckboxes = await page.$$('text=Always');
      test('Always checkbox render', alwaysCheckboxes.length > 0);

      // Check Collapse checkbox
      const collapseCheckboxes = await page.$$('text=Collapse');
      test('Collapse checkbox render', collapseCheckboxes.length > 0);

      // Test Preview
      console.log('\n--- TEST PREVIEW ---');
      if (previewInput && previewBtn) {
        await previewInput.fill('2');
        await previewBtn.click();
        await page.waitForTimeout(2000);

        const previewModal = await page.$('.modal.modal-open');
        test('Preview modal mở', !!previewModal);

        if (previewModal) {
          const htmlContent = await page.$('.modal.modal-open .bg-white');
          test('HTML content render', !!htmlContent);

          if (htmlContent) {
            const content = await htmlContent.textContent();
            test('HTML có nội dung', content.length > 10);
            console.log(`    HTML length: ${content.length} chars`);

            // Check for Vietnamese content
            const hasVietnamese = content.includes('Thông tin') || content.includes('Đề xuất');
            test('HTML chứa nội dung tiếng Việt', hasVietnamese);
          }

          // Close modal
          const closeBtn = await page.$('.modal.modal-open button:has-text("Đóng")');
          if (closeBtn) await closeBtn.click();
          await page.waitForTimeout(500);
        }
      }

      // Test Add Section
      console.log('\n--- TEST ADD SECTION ---');
      if (addSectionBtn) {
        const sectionsBefore = await page.$$('.bg-base-100.rounded-lg.border.border-base-300');
        await addSectionBtn.click();
        await page.waitForTimeout(500);

        const sectionsAfter = await page.$$('.bg-base-100.rounded-lg.border.border-base-300');
        test('Thêm section mới', sectionsAfter.length > sectionsBefore.length);
      }
    }
    console.log('');

    // ========== BƯỚC 9.2: SYNCPANEL PREVIEW TAB ==========
    console.log('--- BƯỚC 9.2: SYNCPANEL PREVIEW TAB ---');

    // Navigate back to API Config
    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click Sync button
    const syncBtn = await page.$('button:has-text("Sync")');
    test('Nút "Sync" tồn tại', !!syncBtn);

    if (syncBtn) {
      await syncBtn.click();
      await page.waitForTimeout(1000);

      // Check tabs
      const pushTab = await page.$('button:has-text("Push")');
      const pullTab = await page.$('button:has-text("Pull")');
      const linkTab = await page.$('button:has-text("Link")');
      const previewTab = await page.$('button:has-text("Preview")');

      test('Push tab tồn tại', !!pushTab);
      test('Pull tab tồn tại', !!pullTab);
      test('Link tab tồn tại', !!linkTab);
      test('Preview tab tồn tại', !!previewTab);

      // Click Preview tab
      if (previewTab) {
        await previewTab.click();
        await page.waitForTimeout(500);

        // Check Preview content
        const previewDesc = await page.$('text=Xem trước HTML desc sẽ được gửi sang 1Office');
        test('Preview description hiển thị', !!previewDesc);

        const previewInput2 = await page.$('input[placeholder="Proposal ID"]');
        test('Preview input trong SyncPanel', !!previewInput2);

        const previewBtn2 = await page.$('button:has-text("Xem trước")');
        test('Nút "Xem trước" trong SyncPanel', !!previewBtn2);

        // Test preview
        if (previewInput2 && previewBtn2) {
          await previewInput2.fill('2');
          await previewBtn2.click();
          await page.waitForTimeout(2000);

          const previewResult = await page.$('.bg-white.p-4.rounded.border');
          test('Preview HTML render trong SyncPanel', !!previewResult);

          if (previewResult) {
            const html = await previewResult.textContent();
            test('HTML content trong SyncPanel có nội dung', html.length > 10);
          }
        }
      }
    }
    console.log('');

    // ========== BƯỚC 9.3: FIELDMAPPING PANEL ==========
    console.log('--- BƯỚC 9.3: FIELDMAPPING PANEL ---');

    // Navigate back to API Config
    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click Mapping button
    const mappingBtn = await page.$('button:has-text("Mapping")');
    test('Nút "Mapping" tồn tại', !!mappingBtn);

    if (mappingBtn) {
      await mappingBtn.click();
      await page.waitForTimeout(1500);

      // Check panel loaded
      const panelTitle = await page.$('text=Field Mappings');
      test('Field Mappings panel load', !!panelTitle);

      // Check proposal fields section
      const proposalFieldsTitle = await page.$('text=Proposal Fields');
      test('Proposal Fields section render', !!proposalFieldsTitle);

      // Check contact fields section
      const contactFieldsTitle = await page.$('text=Contact Fields');
      test('Contact Fields section render', !!contactFieldsTitle);

      // Check Get buttons
      const getBtns = await page.$$('button:has-text("Get")');
      test('Get buttons render', getBtns.length >= 2);

      // Check search input
      const searchInput = await page.$('input[placeholder="Tìm trường..."]');
      test('Search input render', !!searchInput);

      // Check mapped fields badges
      const mappedBadges = await page.$$('.badge:has-text("mapped")');
      test('Mapped badges render', mappedBadges.length > 0);
    }
    console.log('');

    // ========== RESPONSIVE CHECK ==========
    console.log('--- RESPONSIVE CHECK ---');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const tabletBtn = await page.$('button:has-text("Template")');
    test('Tablet viewport: Template button visible', !!tabletBtn);
    console.log('');

    // ========== ERROR CHECK ==========
    console.log('--- CONSOLE ERRORS ---');
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${BASE}/admin/api-configs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const templateBtn2 = await page.$('button:has-text("Template")');
    if (templateBtn2) {
      await templateBtn2.click();
      await page.waitForTimeout(1500);
    }

    const syncBtn2 = await page.$('button:has-text("Sync")');
    if (syncBtn2) {
      await syncBtn2.click();
      await page.waitForTimeout(1000);
    }

    const hasErrors = errors.some(e => e.includes('Error') || e.includes('error'));
    test(`Console errors: ${errors.length} errors`, !hasErrors);
    if (errors.length > 0) {
      errors.forEach(e => console.log(`    ⚠️ ${e}`));
    }

    // ========== SUMMARY ==========
    console.log('\n=== SUMMARY ===');
    let passed = 0;
    let failed = 0;
    for (const r of results) {
      if (r.pass) passed++;
      else failed++;
    }
    console.log(`Total: ${passed}/${results.length} PASS, ${failed} FAIL`);
    console.log(`Pass rate: ${((passed / results.length) * 100).toFixed(1)}%`);

    // Save results
    const fs = require('fs');
    fs.writeFileSync('test-phase9-comprehensive-results.json', JSON.stringify({
      results,
      summary: { total: results.length, passed, failed },
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\nResults saved to test-phase9-comprehensive-results.json');

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await browser.close();
  }
}

main();
