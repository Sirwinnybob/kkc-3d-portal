const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Viewer E2E Tests', () => {
    let mockJobDir;

    test.beforeAll(() => {
        // Setup mock job directory so API fetch requests succeed
        mockJobDir = path.join(process.cwd(), 'jobs', 'TESTJOB', 'TESTROOM');
        fs.mkdirSync(mockJobDir, { recursive: true });
        fs.writeFileSync(path.join(mockJobDir, 'mock.glb'), 'mock glb content');
    });

    test.afterAll(() => {
        // Cleanup mock job directory
        fs.rmSync(path.join(process.cwd(), 'jobs', 'TESTJOB'), { recursive: true, force: true });
    });

    test('Redirects to / if URL parameters are missing', async ({ page }) => {
        await page.goto('http://localhost:5021/viewer.html');
        // Because of the initial redirect, we expect to be on the home page '/'
        await expect(page).toHaveURL('http://localhost:5021/');
    });

    test('Sets job and room displays if parameters are present', async ({ page }) => {
        await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');

        // Wait for the elements to be updated
        const jobDisplay = page.locator('#job-code-display');
        const roomDisplay = page.locator('#room-name-display');

        await expect(jobDisplay).toHaveText('TESTJOB');
        await expect(roomDisplay).toHaveText('TESTROOM');
    });

    test('Menu button toggles dropdown and aria-expanded', async ({ page }) => {
        await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');

        const menuBtn = page.locator('#menu-btn');
        const dropdown = page.locator('#dropdown-menu');

        // Initially not shown
        await expect(dropdown).not.toHaveClass(/show/);
        await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');

        // Click to show
        await menuBtn.click();
        await expect(dropdown).toHaveClass(/show/);
        await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');

        // Click outside to hide
        await page.mouse.click(0, 0); // Click top-left corner
        await expect(dropdown).not.toHaveClass(/show/);
        await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    });

    test('Help modal is toggled by buttons', async ({ page }) => {
        await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');

        const helpBtn = page.locator('#help-btn');
        const helpModal = page.locator('#help-modal');
        const closeX = page.locator('#close-help-x');
        const closeBtn = page.locator('#close-help-btn');

        // Initial state
        await expect(helpModal).not.toHaveClass(/show/);

        // Click to open
        await helpBtn.click();
        await expect(helpModal).toHaveClass(/show/);

        // Click X to close
        await closeX.click();
        await expect(helpModal).not.toHaveClass(/show/);

        // Click to open again
        await helpBtn.click();
        await expect(helpModal).toHaveClass(/show/);

        // Click close button
        await closeBtn.click();
        await expect(helpModal).not.toHaveClass(/show/);
    });
});
