const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../server');

test('Texture API', async (t) => {
    const TEXTURES_DIR = path.resolve(__dirname, '../textures');

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
        // Generate a valid 1x1 black PNG
        const blackPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M8AAQUBAfE4zoQAAAAASUVORK5CYII=', 'base64');
        const randomBase64 = `data:image/png;base64,${blackPng.toString('base64')}`;
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