const test = require('node:test');
const assert = require('node:assert');
const texturesAuth = require('../middleware/texturesAuth');

test('texturesAuth middleware', async (t) => {
    const mockRes = {
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        send: function(msg) {
            this.message = msg;
            return this;
        }
    };

    await t.test('allows normal paths', () => {
        const req = { path: '/Wood/Oak/texture.jpg' };
        let nextCalled = false;
        texturesAuth(req, mockRes, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
    });

    await t.test('blocks Hidden at start', () => {
        const req = { path: '/Hidden/secret.jpg' };
        let nextCalled = false;
        texturesAuth(req, mockRes, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(mockRes.statusCode, 403);
    });

    await t.test('blocks hidden case-insensitive', () => {
        const req = { path: '/hiDDen/secret.jpg' };
        let nextCalled = false;
        texturesAuth(req, mockRes, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(mockRes.statusCode, 403);
    });

    await t.test('blocks Uncategorized in middle', () => {
        const req = { path: '/Some/Uncategorized/file.png' };
        let nextCalled = false;
        texturesAuth(req, mockRes, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(mockRes.statusCode, 403);
    });

    await t.test('blocks hidden at end', () => {
        const req = { path: '/Some/Folder/Hidden' };
        let nextCalled = false;
        texturesAuth(req, mockRes, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(mockRes.statusCode, 403);
    });

    await t.test('allows paths containing hidden as part of a word', () => {
        const req = { path: '/Unbidden/texture.jpg' };
        let nextCalled = false;
        texturesAuth(req, mockRes, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
    });

    await t.test('handles malformed URI components', () => {
        const req = { path: '/%E0%A4%A' }; // Malformed URI
        let nextCalled = false;
        texturesAuth(req, mockRes, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(mockRes.statusCode, 400);
    });
});
