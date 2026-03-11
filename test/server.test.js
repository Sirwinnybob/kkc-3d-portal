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
