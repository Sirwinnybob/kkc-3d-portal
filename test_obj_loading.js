const { chromium } = require('playwright');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
    console.log("Starting server...");
    const server = spawn('node', ['server.js'], { env: { ...process.env, PORT: '5022' } });

    await new Promise(resolve => setTimeout(resolve, 3000)); // wait for server

    const browser = await chromium.launch();
    const page = await browser.newPage();

    let missingTextures = [];
    let successfulTextures = [];

    page.on('response', response => {
        const url = response.url();
        if (url.includes('.jpg') || url.includes('.png')) {
            if (response.status() === 404) {
                missingTextures.push(url);
            } else if (response.status() === 200) {
                successfulTextures.push(url);
            }
        }
    });

    console.log("Navigating to viewer...");
    try {
        await page.goto('http://localhost:5022/viewer.html?job=002&room=f744bca2-2784-4b18-9e27-5009e6b5c9e3', { waitUntil: 'networkidle' });

        console.log("Successful texture loads:", successfulTextures.filter(url => url.includes('f744bca2-2784')));
        console.log("Failed texture loads:", missingTextures);

        if (missingTextures.length === 0 && successfulTextures.filter(url => url.includes('f744bca2-2784')).length > 0) {
            console.log("SUCCESS: Textures loaded correctly.");
        } else {
            console.log("FAIL: Textures did not load correctly.");
        }
    } catch (e) {
        console.error("Test error:", e);
    } finally {
        await browser.close();
        server.kill();
        process.exit(0);
    }
})();
