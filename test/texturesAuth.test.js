const assert = require('assert');
const { test } = require('node:test');
const texturesAuth = require('../middleware/texturesAuth');

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.send = (msg) => {
        res.body = msg;
        return res;
    };
    return res;
};

test('texturesAuth middleware', async (t) => {
    await t.test('allows normal texture paths', () => {
        const req = { path: '/Wood/Oak.jpg' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(res.statusCode, undefined);
    });

    await t.test('blocks Hidden directory', () => {
        const req = { path: '/Hidden/secret.jpg' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks Uncategorized directory', () => {
        const req = { path: '/Uncategorized/unknown.jpg' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('allows Hidden/LOD exception', () => {
        const req = { path: '/Hidden/LOD/Wood/Oak_low.jpg' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(res.statusCode, undefined);
    });

    await t.test('is case-insensitive', () => {
        const req = { path: '/hidden/secret.jpg' };
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('handles encoded paths', () => {
        const req = { path: '/%48idden/secret.jpg' }; // 'H' is %48
        const res = mockRes();
        let nextCalled = false;
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });
});
