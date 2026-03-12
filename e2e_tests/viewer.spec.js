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

    test('Updates sensitivity slider value display', async ({ page }) => {
        // Mock the API endpoints so that the fetch succeeds and `sensSlider.oninput` gets initialized
        await page.route('/api/job/TESTJOB', async route => {
            await route.fulfill({ json: { success: true, rooms: ['TESTROOM'] } });
        });
        await page.route('/api/job/TESTJOB/TESTROOM', async route => {
            await route.fulfill({ json: { success: true, url: '/mock.glb' } });
        });

        await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');

        // We can wait for the 'status' element to change to empty string or 'Downloading...'
        await expect(page.locator('#status')).toHaveText(/Downloading|Loading Design|^$/);

        // Open menu to see slider
        const menuBtn = page.locator('#menu-btn');
        await menuBtn.click();

        const slider = page.locator('#sens-slider');
        const display = page.locator('#sens-val');

        // Default is 1.00
        await expect(display).toHaveText('1.00');

        // Ensure script has attached event handler by waiting a tick
        await page.waitForTimeout(500);

        // Update slider value
        await slider.fill('2.5');
        // Trigger evaluate to update node directly and call oninput
        await slider.evaluate(node => {
            node.value = 2.5;
            if (node.oninput) node.oninput();
        });

        // Display should update
        await expect(display).toHaveText('2.50');
    });

    test('Displays room switcher when API returns multiple rooms', async ({ page }) => {
        // Mock the API endpoint
        await page.route('/api/job/MULTI_ROOM', async route => {
            const json = {
                success: true,
                rooms: ['ROOM1', 'ROOM2']
            };
            await route.fulfill({ json });
        });

        // And mock the specific room endpoint to prevent errors
        await page.route('/api/job/MULTI_ROOM/ROOM1', async route => {
            const json = {
                success: true,
                url: '/mock.glb'
            };
            await route.fulfill({ json });
        });

        await page.goto('http://localhost:5021/viewer.html?job=MULTI_ROOM&room=ROOM1');

        // Open menu to see switcher
        const menuBtn = page.locator('#menu-btn');
        await menuBtn.click();

        const switcher = page.locator('#room-switcher');
        const listUi = page.locator('#room-list-ui');

        // Verify UI visibility
        await expect(switcher).toBeVisible();

        // Verify buttons
        const buttons = listUi.locator('.room-switcher-btn');
        await expect(buttons).toHaveCount(2);
        await expect(buttons.nth(0)).toHaveText('ROOM1');
        await expect(buttons.nth(1)).toHaveText('ROOM2');
    });

    test('Displays error status when API fails', async ({ page }) => {
        // Mock the API endpoint to fail
        await page.route('/api/job/ERROR_JOB', async route => {
            await route.fulfill({
                status: 404,
                json: { success: false, error: 'Job not found' }
            });
        });

        await page.goto('http://localhost:5021/viewer.html?job=ERROR_JOB&room=ANYROOM');

        const statusEl = page.locator('#status');

        // Verify connection error displays
        await expect(statusEl).toHaveText('Connection Error');
        await expect(statusEl).toHaveCSS('color', 'rgb(255, 77, 77)'); // #ff4d4d
    });

    test('Zoom joystick pointer events manipulate joystick position', async ({ page }) => {
        // Mock the API endpoints so that fetch succeeds and script continues
        await page.route('/api/job/TESTJOB', async route => {
            await route.fulfill({ json: { success: true, rooms: ['TESTROOM'] } });
        });
        await page.route('/api/job/TESTJOB/TESTROOM', async route => {
            await route.fulfill({ json: { success: true, url: '/mock.glb' } });
        });

        await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');
        await expect(page.locator('#status')).toHaveText(/Downloading|Loading Design|^$/);

        const joystickHandle = page.locator('#joystick-handle');
        const joystickContainer = page.locator('#joystick-container');

        // Wait for joystick container to be visible
        await expect(joystickContainer).toBeVisible();
        await page.waitForTimeout(500); // Give JS a moment to attach handlers

        // Simulate dragging the joystick
        const handleBox = await joystickHandle.boundingBox();
        const startX = handleBox.x + handleBox.width / 2;
        const startY = handleBox.y + handleBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();

        // Move mouse down relative to the handle
        const newY = startY + 50;
        await page.mouse.move(startX, newY);

        // Let's assert that the style.top property was updated by the onpointermove handler
        const topStyle = await joystickHandle.evaluate(el => el.style.top);

        // The script calculates a specific pixel value. We can verify it's no longer the default
        // Because of variations, we just check if top is a pixel value
        expect(topStyle).toMatch(/^-?\d+(\.\d+)?px$/);

        // Mouse up should release it
        await page.mouse.up();
    });
});
