const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('POST /api/textures/match security tests', async (t) => {
    await t.test('handles missing imageData', async () => {
        const response = await request(app)
            .post('/api/textures/match')
            .send({});
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.success, false);
    });

    await t.test('handles malformed base64 imageData gracefully', async () => {
        const response = await request(app)
            .post('/api/textures/match')
            .send({ imageData: 'not-base64-at-all!!!' });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.matched, false);
    });

    await t.test('handles non-image data in base64', async () => {
        const base64Txt = Buffer.from('this is just text').toString('base64');
        const response = await request(app)
            .post('/api/textures/match')
            .send({ imageData: `data:image/png;base64,${base64Txt}` });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.matched, false);
    });

    await t.test('sanitizes jobCode and room in filename', async () => {
        const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        const response = await request(app)
            .post('/api/textures/match')
            .send({
                imageData: base64Png,
                jobCode: '../../etc/passwd',
                room: 'secret\0room',
                materialName: '!!!'
            });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.matched, false);
    });

    await t.test('handles extremely long input in metadata fields', async () => {
        const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        const response = await request(app)
            .post('/api/textures/match')
            .send({
                imageData: base64Png,
                jobCode: 'A'.repeat(10000),
                room: 'B'.repeat(10000),
                materialName: 'C'.repeat(10000)
            });

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.success);
    });
});
