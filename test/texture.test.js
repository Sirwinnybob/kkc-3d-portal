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

    await t.test('GET /api/textures returns categories', async () => {
        const response = await request(app).get('/api/textures');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.ok(Array.isArray(response.body.categories));
        assert.ok(response.body.categories.includes('Wood'));
        assert.ok(response.body.categories.includes('Stone'));
        assert.ok(response.body.categories.includes('Metal'));
        assert.ok(!response.body.categories.includes('Uncategorized'));
    });

    await t.test('GET /api/textures/:category returns textures in category', async () => {
        const response = await request(app).get('/api/textures/Wood');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(response.body.category, 'Wood');
        assert.ok(Array.isArray(response.body.textures));
        assert.ok(response.body.textures.find(t => t.name === 'Oak'));
        assert.ok(response.body.textures.find(t => t.name === 'Walnut'));
    });

    await t.test('GET /api/textures/:category returns 404 for missing category', async () => {
        const response = await request(app).get('/api/textures/NonExistent');
        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.success, false);
    });

    await t.test('POST /api/textures/match with exact match', async () => {
        const oakBuffer = fs.readFileSync(path.join(TEXTURES_DIR, 'Wood/Oak.jpg'));
        const oakBase64 = `data:image/jpeg;base64,${oakBuffer.toString('base64')}`;

        const response = await request(app)
            .post('/api/textures/match')
            .send({ imageData: oakBase64, jobCode: 'TEST', room: 'ROOM', materialName: 'MAT' });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(response.body.matched, true);
        assert.strictEqual(response.body.bestMatch.name, 'Oak');
        assert.strictEqual(response.body.bestCategory, 'Wood');
    });

    await t.test('POST /api/textures/match saves unmatched to Uncategorized', async () => {
        // Generate random buffer that won't match existing ones
        // Use a more complex pattern to ensure it's different from simple urandom or fixed bytes
        const randomBuffer = Buffer.alloc(4096);
        for (let i = 0; i < 4096; i++) randomBuffer[i] = (i * 37 + 13) % 256;
        const randomBase64 = `data:image/jpeg;base64,${randomBuffer.toString('base64')}`;
        const materialName = 'RareMaterial';

        const response = await request(app)
            .post('/api/textures/match')
            .send({ imageData: randomBase64, jobCode: 'TEST', room: 'ROOM', materialName: materialName });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);

        // Wait a moment for async file write (though it should be awaited in server.js)
        // Actually server.js does await fs.promises.writeFile(destPath, imageBuffer);

        // Check if file was saved in Uncategorized
        const uncategorizedPath = path.join(TEXTURES_DIR, 'Uncategorized');
        const expectedFile = `TEST_ROOM_${materialName}.jpg`;
        const exists = fs.existsSync(path.join(uncategorizedPath, expectedFile));

        if (!exists) {
            console.log('Distance was:', response.body.distance);
            console.log('Matched:', response.body.matched);
        }
        assert.ok(exists, 'Unmatched texture should be saved to Uncategorized');
    });
});
