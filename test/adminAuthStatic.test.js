const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('Admin static assets require authentication', async (t) => {
    // Save current env
    const originalAdminUser = process.env.ADMIN_USER;
    const originalAdminPass = process.env.ADMIN_PASS;

    t.after(() => {
        process.env.ADMIN_USER = originalAdminUser;
        process.env.ADMIN_PASS = originalAdminPass;
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

    await t.test('GET /showroom/staging/test.glb without auth returns 401', async () => {
        process.env.ADMIN_USER = 'admin';
        process.env.ADMIN_PASS = 'password';
        const response = await request(app).get('/showroom/staging/test.glb');
        assert.strictEqual(response.status, 401);
    });

    await t.test('GET /showroom/staging/test.glb with valid auth fails due to missing file (404), not auth (401)', async () => {
        process.env.ADMIN_USER = 'admin';
        process.env.ADMIN_PASS = 'password';
        const response = await request(app)
            .get('/showroom/staging/test.glb')
            .set('Authorization', 'Basic ' + Buffer.from('admin:password').toString('base64'));
        assert.strictEqual(response.status, 404);
    });
});
