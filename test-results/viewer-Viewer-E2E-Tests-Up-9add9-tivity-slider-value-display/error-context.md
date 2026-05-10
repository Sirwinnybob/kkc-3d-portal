# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: viewer.spec.js >> Viewer E2E Tests >> Updates sensitivity slider value display
- Location: e2e_tests/viewer.spec.js:106:5

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('#status')
Timeout: 5000ms
Expected pattern: /Downloading|Loading Design|^$/
Received string:  "·········
        Connection Error
    "

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for locator('#status')
    - locator resolved to <div id="status" role="status" class="visible" aria-live="polite">…</div>
    - unexpected value "

        Initializing 3D...
    "
    - locator resolved to <div id="status" role="status" class="visible" aria-live="polite">…</div>
    - unexpected value "

        Loading High Model...
    "
    6 × locator resolved to <div id="status" role="status" aria-live="polite" class="visible error">…</div>
      - unexpected value "

        Connection Error
    "

```

# Test source

```ts
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
  48  |         await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');
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
> 118 |         await expect(page.locator('#status')).toHaveText(/Downloading|Loading Design|^$/);
      |                                               ^ Error: expect(locator).toHaveText(expected) failed
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
  149 |                 success: true,
  150 |                 rooms: ['ROOM1', 'ROOM2']
  151 |             };
  152 |             await route.fulfill({ json });
  153 |         });
  154 |
  155 |         // And mock the specific room endpoint to prevent errors
  156 |         await page.route('/api/job/MULTI_ROOM/ROOM1', async route => {
  157 |             const json = {
  158 |                 success: true,
  159 |                 url: '/mock.glb'
  160 |             };
  161 |             await route.fulfill({ json });
  162 |         });
  163 |
  164 |         await page.goto('http://localhost:5021/viewer.html?job=MULTI_ROOM&room=ROOM1');
  165 |
  166 |         // Open menu to see switcher
  167 |         const menuBtn = page.locator('#menu-btn');
  168 |         await menuBtn.click();
  169 |
  170 |         const switcher = page.locator('#room-switcher');
  171 |         const listUi = page.locator('#room-list-ui');
  172 |
  173 |         // Verify UI visibility
  174 |         await expect(switcher).toBeVisible();
  175 |
  176 |         // Verify buttons
  177 |         const buttons = listUi.locator('.room-switcher-btn');
  178 |         await expect(buttons).toHaveCount(2);
  179 |         await expect(buttons.nth(0)).toHaveText('ROOM1');
  180 |         await expect(buttons.nth(1)).toHaveText('ROOM2');
  181 |     });
  182 |
  183 |     test('Displays error status when API fails', async ({ page }) => {
  184 |         // Mock the API endpoint to fail
  185 |         await page.route('/api/job/ERROR_JOB', async route => {
  186 |             await route.fulfill({
  187 |                 status: 404,
  188 |                 json: { success: false, error: 'Job not found' }
  189 |             });
  190 |         });
  191 |
  192 |         await page.goto('http://localhost:5021/viewer.html?job=ERROR_JOB&room=ANYROOM');
  193 |
  194 |         const statusEl = page.locator('#status');
  195 |
  196 |         // Verify connection error displays
  197 |         await expect(statusEl).toHaveText('Connection Error');
  198 |         await expect(statusEl).toHaveCSS('color', 'rgb(255, 107, 107)'); // #ff6b6b
  199 |     });
  200 |
  201 |     test('Zoom joystick pointer events manipulate joystick position', async ({ page }) => {
  202 |         // Mock the API endpoints so that fetch succeeds and script continues
  203 |         await page.route('/api/job/TESTJOB', async route => {
  204 |             await route.fulfill({ json: { success: true, rooms: ['TESTROOM'] } });
  205 |         });
  206 |         await page.route('/api/job/TESTJOB/TESTROOM', async route => {
  207 |             await route.fulfill({ json: { success: true, url: '/mock.glb' } });
  208 |         });
  209 |
  210 |         await page.goto('http://localhost:5021/viewer.html?job=TESTJOB&room=TESTROOM');
  211 |         await expect(page.locator('#status')).toHaveText(/Downloading|Loading Design|^$/);
  212 |
  213 |         const joystickHandle = page.locator('#joystick-handle');
  214 |         const joystickContainer = page.locator('#joystick-container');
  215 |
  216 |         // Wait for joystick container to be visible
  217 |         await expect(joystickContainer).toBeVisible();
  218 |         await page.waitForTimeout(500); // Give JS a moment to attach handlers
```