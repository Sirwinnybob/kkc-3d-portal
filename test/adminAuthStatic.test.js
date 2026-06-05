const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.ADMIN_USER = 'testadmin';
process.env.ADMIN_PASS = 'testpass';
const app = require('../server');

test('Admin Auth Static File Tests', async (t) => {
    // Create a dummy file in the public/admin directory
    const adminDir = path.join(__dirname, '../public/admin');
    const dummyFile = path.join(adminDir, 'dummy.txt');
    if (!fs.existsSync(adminDir)) {
        fs.mkdirSync(adminDir, { recursive: true });
    }
    fs.writeFileSync(dummyFile, 'secret content');

    await t.test('returns 401 for unauthenticated access to /admin/dummy.txt', async () => {
        const response = await request(app).get('/admin/dummy.txt');
        assert.strictEqual(response.status, 401);
    });

    await t.test('returns 200 for authenticated access to /admin/dummy.txt', async () => {
        const response = await request(app)
            .get('/admin/dummy.txt')
            .auth('testadmin', 'testpass');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.text, 'secret content');
    });

    // Cleanup
    fs.unlinkSync(dummyFile);
});
