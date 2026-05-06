const test = require('node:test');
const assert = require('node:assert');
const texturesAuth = require('../middleware/texturesAuth');

test('texturesAuth middleware', async (t) => {
    await t.test('should allow access to normal texture categories', () => {
        let nextCalled = false;
        const req = { path: '/Wood/Oak.jpg' };
        const res = {};
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('should block access to Hidden directory', () => {
        let statusSet = 0;
        let sentMessage = '';
        const req = { path: '/Hidden/SuperSecret.jpg' };
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: (m) => { sentMessage = m; } };
            }
        };
        const next = () => { throw new Error('next() should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
        assert.strictEqual(sentMessage, 'Forbidden');
    });

    await t.test('should block access to Uncategorized directory', () => {
        let statusSet = 0;
        const req = { path: '/Uncategorized/dump.png' };
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next() should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
    });

    await t.test('should allow access to Hidden/LOD exception', () => {
        let nextCalled = false;
        const req = { path: '/Hidden/LOD/Kitchen/door_low.jpg' };
        const res = {};
        const next = () => { nextCalled = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('should handle encoded path traversal attempts', () => {
        let statusSet = 0;
        // %2e%2e%2fHidden -> ../Hidden
        const req = { path: '/Other/%2e%2e%2fHidden/secret.jpg' };
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next() should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
    });

    await t.test('should handle backslashes in paths (Windows style)', () => {
        let statusSet = 0;
        const req = { path: '\\Hidden\\secret.jpg' };
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next() should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
    });
});
