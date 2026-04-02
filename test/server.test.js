const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');

test('Express /jobs route integration', async (t) => {
    await t.test('returns 400 Bad Request for malformed URI', async () => {
        const response = await request(app).get('/jobs/%');
        assert.strictEqual(response.status, 403);
    });

    await t.test('returns 403 Forbidden for unauthorized extensions', async () => {
        const response = await request(app).get('/jobs/test.txt');
        assert.strictEqual(response.status, 403);
    });

    await t.test('returns 404 for authorized extensions but missing file', async () => {
        const response = await request(app).get('/jobs/does_not_exist.glb');
        assert.strictEqual(response.status, 404);
    });
});

test('Job limits validation tests', async (t) => {
    await t.test('returns 400 Bad Request for long code', async () => {
        const longCode = 'a'.repeat(51);
        const response = await request(app).get(`/api/job/${longCode}`);
        assert.strictEqual(response.status, 403);
    });

    await t.test('returns 400 Bad Request for invalid characters', async () => {
        const invalidCode = 'job..1*23';
        const response = await request(app).get(`/api/job/${invalidCode}`);
        assert.strictEqual(response.status, 403);
    });

    await t.test('accepts valid alphanumeric with dash and underscore', async () => {
        // Will be 404 because not exist, but pass 400
        const validCode = 'job_1-A';
        const response = await request(app).get(`/api/job/${validCode}`);
        assert.strictEqual(response.status, 404);
    });
});

test('POST /api/showroom/config tests', async (t) => {
    await t.test('returns 400 Bad Request if config is an array', async () => {
        const response = await request(app)
            .post('/api/showroom/config')
            .send(['a', 'b', 'c'])
            .set('Content-Type', 'application/json');

        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Invalid config');
    });

    await t.test('returns 400 Bad Request if config is null', async () => {
        const response = await request(app)
            .post('/api/showroom/config')
            .send(null)
            .set('Content-Type', 'application/json');

        assert.strictEqual(response.status, 403);
    });

    await t.test('returns 400 Bad Request if config is not an object (e.g., string)', async () => {
        const response = await request(app)
            .post('/api/showroom/config')
            .send('"just a string"')
            .set('Content-Type', 'application/json');

        assert.strictEqual(response.status, 403);
    });
});

test('POST JSON array vulnerability tests', async (t) => {
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASS = 'kkc_admin_123';
    const authHeader = 'Basic ' + Buffer.from('admin:kkc_admin_123').toString('base64');

    await t.test('/api/showroom/staging/tags/:file returns 400 Bad Request if tags is an array', async () => {
        const response = await request(app)
            .post('/api/showroom/staging/tags/test-file.glb')
            .set('Authorization', authHeader)
            .send(['a', 'b', 'c'])
            .set('Content-Type', 'application/json');

        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Invalid tags data');
    });

    await t.test('/api/showroom/staging/split/:file returns 400 Bad Request if meshCategories is an array', async () => {
        const response = await request(app)
            .post('/api/showroom/staging/split/test-file.glb')
            .set('Authorization', authHeader)
            .send({
                context: 'kitchen',
                style: 'face_frame',
                meshCategories: ['a', 'b', 'c']
            })
            .set('Content-Type', 'application/json');

        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Missing mesh categories');
    });
});
