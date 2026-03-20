const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');

test('Texture Variant Matching', async (t) => {
    const TEXTURES_DIR = process.env.TEXTURES_DIR || path.join(__dirname, '../textures');
    const categoryDir = path.join(TEXTURES_DIR, 'TestCategory');
    const hashesDir = path.join(categoryDir, 'hashes');

    // Setup test environment
    if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });
    if (!fs.existsSync(hashesDir)) fs.mkdirSync(hashesDir, { recursive: true });

    // Create a canonical 1x1 black PNG
    const blackPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M8AAQUBAfE4zoQAAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(path.join(categoryDir, 'Test Canonical.png'), blackPng);

    // Create a variant 1x1 white PNG (linked via name "Test Canonical_1.png")
    const whitePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(path.join(hashesDir, 'Test Canonical_1.png'), whitePng);

    await t.test('Variant matches return canonical metadata', async () => {
        // We match against the white PNG (the variant)
        const response = await request(app)
            .post('/api/textures/match')
            .send({ imageData: whitePng.toString('base64') });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.matched, true);
        assert.strictEqual(response.body.bestMatch.name, 'Test Canonical');
        assert.strictEqual(response.body.bestMatch.file, 'Test Canonical.png');
        assert.ok(response.body.bestMatch.url.includes('Test%20Canonical.png'));
    });

    // Cleanup
    fs.rmSync(categoryDir, { recursive: true, force: true });
});
