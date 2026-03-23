const { test, expect } = require('@playwright/test');

test.describe('Escape Key Closure', () => {
  test.beforeEach(async ({ page }) => {
    // Prevent help modal and disclaimer from blocking tests
    await page.addInitScript(() => {
      localStorage.setItem('kkc_help_shown', 'true');
      localStorage.setItem('kkc_skip_disclaimer', 'true');
      localStorage.setItem('kkc_tutorial_v1', 'true');
    });

    // Mock API responses
    await page.route('/api/job/123', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, rooms: ['Kitchen'] })
      });
    });

    await page.route('/api/job/123/Kitchen', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, url: '/jobs/123/Kitchen.glb' })
      });
    });

    // Mock the GLB file
    await page.route('/jobs/123/Kitchen.glb', async route => {
      await route.fulfill({ status: 200, body: Buffer.alloc(0) });
    });

    await page.goto('/viewer.html?job=123&room=Kitchen');
  });

  test('Escape key should close help modal and restore focus', async ({ page }) => {
    const helpBtn = page.locator('#help-btn');
    const helpModal = page.locator('#help-modal');

    // Open help modal
    await helpBtn.click();
    await expect(helpModal).toHaveClass(/show/);

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should be hidden
    await expect(helpModal).not.toHaveClass(/show/);

    // Focus should be restored to help button
    const isFocused = await helpBtn.evaluate(el => document.activeElement === el);
    expect(isFocused).toBe(true);
  });

  test('Escape key should close dropdown menu', async ({ page }) => {
    const menuBtn = page.locator('#menu-btn');
    const dropdown = page.locator('#dropdown-menu');

    // Open dropdown
    await menuBtn.click();
    await expect(dropdown).toHaveClass(/show/);

    // Press Escape
    await page.keyboard.press('Escape');

    // Dropdown should be hidden
    await expect(dropdown).not.toHaveClass(/show/);
  });
});
