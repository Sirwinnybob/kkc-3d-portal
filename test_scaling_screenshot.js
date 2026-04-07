const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to local viewer instance
  await page.goto('http://localhost:5021');

  // Dismiss modal (Product Tour)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // We'll open the model loader and load a default if possible, or just open texture panel
  // Actually we just need to see if the interface loads and we can open the texture panel to check sizes.
  await page.evaluate(() => {
    if (document.getElementById('textures-btn')) {
      document.getElementById('textures-btn').click();
    }
  });

  // Wait for texture panel to open
  await page.waitForTimeout(1000);

  // Take screenshot
  const screenshotPath = path.join(__dirname, 'screenshot_frontend_scale.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
})();
