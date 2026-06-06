const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('Admin static endpoints require authentication', async (t) => {
    // Save current env
    const originalAdminUser = process.env.ADMIN_USER;
    const originalAdminPass = process.env.ADMIN_PASS;

    t.after(() => {
        process.env.ADMIN_USER = originalAdminUser;
        process.env.ADMIN_PASS = originalAdminPass;
    });

    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASS = 'password';

    await t.test('GET /admin/tagger.html without auth returns 401', async () => {
        const response = await request(app).get('/admin/tagger.html');
        assert.strictEqual(response.status, 401);
    });
});
