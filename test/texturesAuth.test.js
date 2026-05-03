const assert = require('assert');
const texturesAuth = require('../middleware/texturesAuth');

// Node.js native test runner
const test = require('node:test');

test('texturesAuth middleware', async (t) => {
    const mockRes = {
        statusCode: null,
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        send: function(msg) {
            this.message = msg;
            return this;
        }
    };

    const createMockNext = () => {
        const next = () => { next.called = true; };
        next.called = false;
        return next;
    };

    await t.test('allows normal texture paths', () => {
        const next = createMockNext();
        texturesAuth({ path: '/Oak/veneer.jpg' }, mockRes, next);
        assert.strictEqual(next.called, true);
    });

    await t.test('blocks Hidden directory', () => {
        const next = createMockNext();
        mockRes.statusCode = null;
        texturesAuth({ path: '/Hidden/secret.jpg' }, mockRes, next);
        assert.strictEqual(mockRes.statusCode, 403);
        assert.strictEqual(next.called, false);
    });

    await t.test('blocks Uncategorized directory', () => {
        const next = createMockNext();
        mockRes.statusCode = null;
        texturesAuth({ path: '/Uncategorized/tmp.jpg' }, mockRes, next);
        assert.strictEqual(mockRes.statusCode, 403);
        assert.strictEqual(next.called, false);
    });

    await t.test('allows Hidden/LOD exception for thumbnails', () => {
        const next = createMockNext();
        mockRes.statusCode = null;
        texturesAuth({ path: '/Hidden/LOD/kitchen/door_low.jpg' }, mockRes, next);
        assert.strictEqual(next.called, true);
    });

    await t.test('blocks traversal attempts to Hidden', () => {
        const next = createMockNext();
        mockRes.statusCode = null;
        // path.normalize will resolve this to /Hidden/secret.jpg
        texturesAuth({ path: '/Public/../Hidden/secret.jpg' }, mockRes, next);
        assert.strictEqual(mockRes.statusCode, 403);
        assert.strictEqual(next.called, false);
    });

    await t.test('handles encoded traversal', () => {
        const next = createMockNext();
        mockRes.statusCode = null;
        // %2e%2e is ..
        texturesAuth({ path: '/Public/%2e%2e/Hidden/secret.jpg' }, mockRes, next);
        assert.strictEqual(mockRes.statusCode, 403);
        assert.strictEqual(next.called, false);
    });
});
