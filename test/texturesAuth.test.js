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

    await t.test('allows standard texture paths', () => {
        const req = { path: '/Oak/oak_natural.jpg' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(res.statusCode, undefined);
    });

    await t.test('blocks Hidden segment', () => {
        const req = { path: '/Hidden/secret.jpg' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks Uncategorized segment', () => {
        const req = { path: '/Uncategorized/temp.png' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks nested Hidden segment', () => {
        const req = { path: '/Some/Sub/Hidden/file.jpg' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('is case-insensitive', () => {
        const req = { path: '/hidden/file.jpg' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('handles URI encoded paths', () => {
        const req = { path: '/%48idden/file.jpg' }; // %48 is 'H'
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('handles malformed URI encoded paths', () => {
        const req = { path: '/%E0%A4%A' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 400);
    });

    await t.test('allows paths that merely contain the strings but not as segments', () => {
        const req = { path: '/NotHiddenButContains/file.jpg' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('blocks traversal attempts', () => {
        const req = { path: '/Oak/../Hidden/file.jpg' };
        const res = mockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        // Current implementation (split by /) might actually block this if it doesn't resolve ..
        // Let's see how it behaves.
        // If it splits: ["Oak", "..", "Hidden", "file.jpg"] -> Hidden is a segment, so it blocks.
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
    });
});
