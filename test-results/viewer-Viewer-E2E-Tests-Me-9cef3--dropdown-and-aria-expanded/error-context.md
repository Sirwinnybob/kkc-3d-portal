# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: viewer.spec.js >> Viewer E2E Tests >> Menu button toggles dropdown and aria-expanded
- Location: e2e_tests/viewer.spec.js:47:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM", waiting until "load"

```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | const path = require('path');
  3   | const fs = require('fs');
  4   |
  5   | test.describe('Viewer E2E Tests', () => {
  6   |     let mockJobDir;
  7   |
  8   |     test.beforeAll(() => {
  9   |         // Setup mock job directory so API fetch requests succeed
  10  |         mockJobDir = path.join(process.cwd(), 'jobs', 'TESTJOB', 'TESTROOM');
  11  |         fs.mkdirSync(mockJobDir, { recursive: true });
  12  |         fs.writeFileSync(path.join(mockJobDir, 'mock.glb'), 'mock glb content');
  13  |     });
  14  |
  15  |     test.afterAll(() => {
  16  |         // Cleanup mock job directory
  17  |         fs.rmSync(path.join(process.cwd(), 'jobs', 'TESTJOB'), { recursive: true, force: true });
  18  |     });
  19  |
  20  |     test.beforeEach(async ({ page }) => {
  21  |         // Pre-set help shown to prevent modal from blocking interactions
  22  |         await page.addInitScript(() => {
  23  |             window.localStorage.setItem('kkc_help_shown', 'true');
  24  |             window.localStorage.setItem('kkc_tutorial_v1', 'true');
  25  |             window.localStorage.setItem('kkc_tutorial_v1', 'true');
  26  |             window.localStorage.setItem('kkc_skip_disclaimer', 'true');
  27  |         });
  28  |     });
  29  |
  30  |     test('Redirects to / if URL parameters are missing', async ({ page }) => {
  31  |         await page.goto('http://localhost:5021/viewer.html');
  32  |         // Because of the initial redirect, we expect to be on the home page '/'
  33  |         await expect(page).toHaveURL('http://localhost:5021/');
  34  |     });
  35  |
  36  |     test('Sets job and room displays if parameters are present', async ({ page }) => {
  37  |         await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');
  38  |
  39  |         // Wait for the elements to be updated
  40  |         const jobDisplay = page.locator('#job-code-display');
  41  |         const roomDisplay = page.locator('#room-name-display');
  42  |
  43  |         await expect(jobDisplay).toHaveText('TESTJOB');
  44  |         await expect(roomDisplay).toHaveText('TESTROOM');
  45  |     });
  46  |
  47  |     test('Menu button toggles dropdown and aria-expanded', async ({ page }) => {
> 48  |         await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');
      |                    ^ Error: page.goto: Test timeout of 30000ms exceeded.
  49  |
  50  |         const menuBtn = page.locator('#menu-btn');
  51  |         const dropdown = page.locator('#dropdown-menu');
  52  |
  53  |         // Initially not shown
  54  |         await expect(dropdown).not.toHaveClass(/show/);
  55  |         await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
  56  |
  57  |         // Click to show
  58  |         await menuBtn.click();
  59  |         await expect(dropdown).toHaveClass(/show/);
  60  |         await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
  61  |
  62  |         // Click outside to hide
  63  |         await page.mouse.click(0, 0); // Click top-left corner
  64  |         await expect(dropdown).not.toHaveClass(/show/);
  65  |         await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
  66  |     });
  67  |
  68  |     test('Help modal is toggled by buttons', async ({ page }) => {
  69  |         // Specifically for this test, clear the storage so it starts open or we test manual toggle
  70  |         await page.addInitScript(() => {
  71  |             window.localStorage.removeItem('kkc_help_shown');
  72  |             window.localStorage.setItem('kkc_tutorial_v1', 'true');
  73  |         });
  74  |
  75  |         await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');
  76  |
  77  |         const helpBtn = page.locator('#help-btn');
  78  |         const helpModal = page.locator('#help-modal');
  79  |         const closeX = page.locator('#close-help-x');
  80  |         const closeBtn = page.locator('#close-help-btn');
  81  |
  82  |         // Initial state - should be shown because we cleared localStorage
  83  |         await expect(helpModal).toHaveClass(/show/);
  84  |
  85  |         // Click close
  86  |         await closeBtn.click();
  87  |         await expect(helpModal).not.toHaveClass(/show/);
  88  |
  89  |         // Click to open
  90  |         await helpBtn.click();
  91  |         await expect(helpModal).toHaveClass(/show/);
  92  |
  93  |         // Click X to close
  94  |         await closeX.click();
  95  |         await expect(helpModal).not.toHaveClass(/show/);
  96  |
  97  |         // Click to open again
  98  |         await helpBtn.click();
  99  |         await expect(helpModal).toHaveClass(/show/);
  100 |
  101 |         // Click close button
  102 |         await closeBtn.click();
  103 |         await expect(helpModal).not.toHaveClass(/show/);
  104 |     });
  105 |
  106 |     test('Updates sensitivity slider value display', async ({ page }) => {
  107 |         // Mock the API endpoints so that the fetch succeeds and `sensSlider.oninput` gets initialized
  108 |         await page.route('/api/job/TESTJOB', async route => {
  109 |             await route.fulfill({ json: { success: true, rooms: ['TESTROOM'] } });
  110 |         });
  111 |         await page.route('/api/job/TESTJOB/TESTROOM', async route => {
  112 |             await route.fulfill({ json: { success: true, url: '/mock.glb' } });
  113 |         });
  114 |
  115 |         await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');
  116 |
  117 |         // We can wait for the 'status' element to change to empty string or 'Downloading...'
  118 |         await expect(page.locator('#status')).toHaveText(/Downloading|Loading Design|^$/);
  119 |
  120 |         // Open menu to see slider
  121 |         const menuBtn = page.locator('#menu-btn');
  122 |         await menuBtn.click();
  123 |
  124 |         const slider = page.locator('#sens-slider');
  125 |         const display = page.locator('#sens-val');
  126 |
  127 |         // Default is 1.00
  128 |         await expect(display).toHaveText('1.00');
  129 |
  130 |         // Ensure script has attached event handler by waiting a tick
  131 |         await page.waitForTimeout(500);
  132 |
  133 |         // Update slider value
  134 |         await slider.fill('2.5');
  135 |         // Trigger evaluate to update node directly and call oninput
  136 |         await slider.evaluate(node => {
  137 |             node.value = 2.5;
  138 |             if (node.oninput) node.oninput();
  139 |         });
  140 |
  141 |         // Display should update
  142 |         await expect(display).toHaveText('2.50');
  143 |     });
  144 |
  145 |     test('Displays room switcher when API returns multiple rooms', async ({ page }) => {
  146 |         // Mock the API endpoint
  147 |         await page.route('/api/job/MULTI_ROOM', async route => {
  148 |             const json = {
```