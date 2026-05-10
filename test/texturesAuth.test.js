const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const texturesAuth = require('../middleware/texturesAuth');

test('texturesAuth middleware', async (t) => {
    const mockRes = () => {
        const res = {
            statusCode: 200,
            status: function(s) { this.statusCode = s; return this; },
            send: function(m) { this.message = m; return this; }
        };
        return res;
    };

    await t.test('allows normal texture paths', () => {
        const req = { path: '/Wood/Oak.jpg' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(res.statusCode, 200);
    });

    await t.test('blocks Hidden directory', () => {
        const req = { path: '/Hidden/secret.png' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks Uncategorized directory', () => {
        const req = { path: '/Uncategorized/tmp.webp' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks case-insensitive restricted directories', () => {
        const req = { path: '/hidden/secret.png' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks encoded restricted directories', () => {
        const req = { path: '/%48idden/secret.png' }; // %48 is 'H'
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks directory traversal to Hidden', () => {
        const req = { path: '/Wood/../Hidden/secret.png' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        // NOTE: The current implementation fails this because it doesn't normalize!
        // We expect it to be blocked in the final implementation.
        // For now, we just document current behavior if we were doing TDD,
        // but here I'll write what it SHOULD be.
        assert.strictEqual(res.statusCode, 403, 'Should block traversal to Hidden');
    });

    await t.test('allows Hidden/LOD exception', () => {
        const req = { path: '/Hidden/LOD/Wood/Oak_low.jpg' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        // NOTE: The current implementation blocks this!
        assert.strictEqual(nextCalled, true, 'Should allow Hidden/LOD exception');
    });
});
