const { test, expect } = require('@playwright/test');

test.describe('Showroom Mode', () => {
    test('should load showroom mode without ReferenceError', async ({ page }) => {
        // Mock showroom API
        await page.route('**/api/showroom/categories', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, categories: {} }),
            });
        });

        const logs = [];
        page.on('console', msg => {
            if (msg.type() === 'error') logs.push(msg.text());
        });

        // Navigate to viewer in showroom mode
        await page.goto('http://localhost:5021/viewer.html?mode=showroom');

        // Check for the error reported by the user
        const setupPanelError = logs.find(log => log.includes('setupTexturePanel is not defined'));
        expect(setupPanelError).toBeUndefined();

        // Verify showroom panel is visible (initShowroomMode opens it by default)
        const showroomPanel = page.locator('#showroom-panel');
        await expect(showroomPanel).toHaveClass(/show/);
    });
});
