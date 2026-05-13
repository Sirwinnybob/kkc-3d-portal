const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('Admin endpoints require authentication', async (t) => {
    // Save current env
    const originalAdminUser = process.env.ADMIN_USER;
    const originalAdminPass = process.env.ADMIN_PASS;

    t.after(() => {
        process.env.ADMIN_USER = originalAdminUser;
        process.env.ADMIN_PASS = originalAdminPass;
    });

    await t.test('POST /api/textures/scan-jobs without env configured returns 500', async () => {
        delete process.env.ADMIN_USER;
        delete process.env.ADMIN_PASS;
        const response = await request(app).post('/api/textures/scan-jobs');
        assert.strictEqual(response.status, 500);
    });

    await t.test('POST /api/textures/scan-jobs without auth returns 401', async () => {
        process.env.ADMIN_USER = 'admin';
        process.env.ADMIN_PASS = 'password';
        const response = await request(app).post('/api/textures/scan-jobs');
        assert.strictEqual(response.status, 401);
    });

    await t.test('GET /api/showroom/staging with valid auth succeeds', async () => {
        process.env.ADMIN_USER = 'admin';
        process.env.ADMIN_PASS = 'password';
        const response = await request(app)
            .get('/api/showroom/staging')
            .set('Authorization', 'Basic ' + Buffer.from('admin:password').toString('base64'));
        assert.strictEqual(response.status, 200);
    });

    await t.test('GET /admin/tagger.html without auth returns 401', async () => {
        process.env.ADMIN_USER = 'admin';
        process.env.ADMIN_PASS = 'password';
        const response = await request(app).get('/admin/tagger.html');
        assert.strictEqual(response.status, 401);
    });

    await t.test('GET /admin/tagger.html with valid auth succeeds', async () => {
        process.env.ADMIN_USER = 'admin';
        process.env.ADMIN_PASS = 'password';
        const response = await request(app)
            .get('/admin/tagger.html')
            .set('Authorization', 'Basic ' + Buffer.from('admin:password').toString('base64'));
        assert.strictEqual(response.status, 200);
    });
});
