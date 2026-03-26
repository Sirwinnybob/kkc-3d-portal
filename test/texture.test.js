const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const path = require('path');
const fs = require('fs');

test('Texture API', async (t) => {
    // Before requiring app, mock the TEXTURES_DIR to an isolated path
    const isolatedTexturesDir = path.join(__dirname, 'mock_textures_api_isolated');
    if (!fs.existsSync(isolatedTexturesDir)) fs.mkdirSync(isolatedTexturesDir, { recursive: true });

    // We cannot change TEXTURES_DIR dynamically because it's a const in server.js evaluated at require time.
    // Instead we delete the require cache and re-require the app.
    process.env.TEXTURES_DIR = isolatedTexturesDir;
    delete require.cache[require.resolve('../server')];
    const app = require('../server');

    const TEXTURES_DIR = isolatedTexturesDir;

    t.after(() => {
        // Cleanup Uncategorized files created during tests
        const uncategorizedPath = path.join(TEXTURES_DIR, 'Uncategorized');
        if (fs.existsSync(uncategorizedPath)) {
            const files = fs.readdirSync(uncategorizedPath);
            for (const file of files) {
                if (file.startsWith('TEST_ROOM_')) {
                    fs.unlinkSync(path.join(uncategorizedPath, file));
                }
            }
        }
        // Cleanup isolated dir
        fs.rmSync(isolatedTexturesDir, { recursive: true, force: true });
    });

    await t.test('GET /api/textures returns categories (may be empty)', async () => {
        const response = await request(app).get('/api/textures');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.ok(Array.isArray(response.body.categories));
        assert.ok(!response.body.categories.includes('Uncategorized'));
    });

    await t.test('GET /api/textures/:category returns 404 for missing category', async () => {
        const response = await request(app).get('/api/textures/NonExistent');
        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.success, false);
    });

    await t.test('POST /api/textures/match with no catalog saves to Uncategorized', async () => {
        if (app.locals.clearTextureCache) app.locals.clearTextureCache();

        await new Promise(resolve => setTimeout(resolve, 500));

        // Generate random buffer - with empty catalog, should always save to Uncategorized
        const randomBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const materialName = 'TestMaterial';

        const response = await request(app)
            .post('/api/textures/match')
            .send({ imageData: randomBase64, jobCode: 'TEST', room: 'ROOM', materialName: materialName });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);

        // With empty catalog, distance should be Infinity (no matches)
        assert.strictEqual(response.body.matched, false);

        // Check if file was saved in Uncategorized
        const uncategorizedPath = path.join(TEXTURES_DIR, 'Uncategorized');
        const expectedFile = `TEST_ROOM_${materialName}.jpg`;
        const exists = fs.existsSync(path.join(uncategorizedPath, expectedFile));
        assert.ok(exists, 'Unmatched texture should be saved to Uncategorized');
    });
});
