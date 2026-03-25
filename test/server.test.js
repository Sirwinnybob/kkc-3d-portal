const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('Express /jobs route integration', async (t) => {
    await t.test('returns 400 Bad Request for malformed URI', async () => {
        // Send a request to /jobs/% to simulate decodeURIComponent failure
        const response = await request(app).get('/jobs/%');

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.text, 'Bad Request');
    });

    await t.test('returns 403 Forbidden for unauthorized extensions', async () => {
        // Since we cannot read .txt files by policy
        const response = await request(app).get('/jobs/test.txt');

        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.text, 'Forbidden');
    });

    await t.test('returns 404 for authorized extensions but missing file', async () => {
        // Authorized file type (.glb) but it shouldn't exist
        const response = await request(app).get('/jobs/does_not_exist.glb');

        assert.strictEqual(response.status, 404);
    });
});

test('Job limits validation tests', async (t) => {
    await t.test('returns 400 Bad Request for long code', async () => {
        const longCode = 'a'.repeat(51);
        const response = await request(app).get(`/api/job/${longCode}`);
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.error, 'Bad Request: Invalid job code format');
    });

    await t.test('returns 400 Bad Request for invalid characters', async () => {
        const invalidCode = 'job..1*23';
        const response = await request(app).get(`/api/job/${encodeURIComponent(invalidCode)}`);
        assert.strictEqual(response.status, 400);
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

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Invalid config');
    });

    await t.test('returns 400 Bad Request if config is null', async () => {
        const response = await request(app)
            .post('/api/showroom/config')
            .send(null)
            .set('Content-Type', 'application/json');

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Invalid config');
    });

    await t.test('returns 400 Bad Request if config is not an object (e.g., string)', async () => {
        const response = await request(app)
            .post('/api/showroom/config')
            .send('"just a string"')
            .set('Content-Type', 'application/json');

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Invalid config');
    });
});
