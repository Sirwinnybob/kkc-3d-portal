import { chromium } from 'playwright';
import express from 'express';

const app = express();
app.use(express.static('public'));
app.use('/test', express.static('test'));

// Mock API for job
app.get('/api/job/002/6ef73686-c678-4dca-a39a-478d97d6cbfb', (req, res) => {
    res.json({ success: true, url: '/test/Sketchup_obj/f744bca2-2784-4b18-9e27-5009e6b5c9e3.obj' });
});

app.get('/api/job/002', (req, res) => {
    res.json({ success: true, rooms: ['6ef73686-c678-4dca-a39a-478d97d6cbfb'] });
});

// Mock texture list API so JSON parse doesn't fail
app.get('/api/job/002/6ef73686-c678-4dca-a39a-478d97d6cbfb/textures', (req, res) => {
    res.json({ success: true, manifest: [] });
});

const server = app.listen(3000, async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // We navigate to the viewer page as the user did!
    await page.goto('http://localhost:3000/viewer.html?job=002&room=6ef73686-c678-4dca-a39a-478d97d6cbfb');
    await page.waitForTimeout(6000);

    await page.screenshot({ path: '/home/jules/verification.png' });
    await browser.close();
    server.close();
});
