const test = require('node:test');
const assert = require('node:assert');
const texturesAuth = require('../middleware/texturesAuth');

test('texturesAuth middleware', async (t) => {
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

    await t.test('allows normal texture paths', () => {
        const req = { path: '/Oak.jpg' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
    });

    await t.test('blocks Hidden directory', () => {
        const req = { path: '/Hidden/Secret.jpg' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks Uncategorized directory', () => {
        const req = { path: '/Uncategorized/SomeFile.jpg' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('allows Hidden/LOD exception', () => {
        const req = { path: '/Hidden/LOD/Oak_low.jpg' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
    });

    await t.test('blocks case-insensitive Hidden', () => {
        const req = { path: '/hidden/Secret.jpg' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('handles encoded traversal attempts and blocks them', () => {
        // %2e%2e%2fHidden -> ../Hidden
        const req = { path: '/%2e%2e%2fHidden/Secret.jpg' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks traversal bypass attempts using LOD exception', () => {
        // /../hidden/lod/../../hidden/secret.txt -> /hidden/secret.txt (after normalization)
        const req = { path: '/%2e%2e%2fhidden%2flod%2f..%2f..%2fhidden%2fsecret.txt' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks LOD exception if it is not at the root', () => {
        // /Something/Hidden/LOD/file.jpg -> blocked because Hidden is in the path
        const req = { path: '/Something/Hidden/LOD/file.jpg' };
        let nextCalled = false;
        const res = mockRes();
        texturesAuth(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });
});
