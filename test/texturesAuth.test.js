const test = require('node:test');
const assert = require('node:assert');
const texturesAuth = require('../middleware/texturesAuth');

test('texturesAuth middleware', async (t) => {
    const mockRes = {
        status: function(s) { this.statusCode = s; return this; },
        send: function(m) { this.message = m; return this; }
    };

    const check = (path) => {
        let nextCalled = false;
        const req = { path };
        const res = Object.create(mockRes);
        texturesAuth(req, res, () => { nextCalled = true; });
        return { nextCalled, statusCode: res.statusCode };
    };

    await t.test('allows normal texture paths', () => {
        const result = check('/textures/Oak/oak_natural.jpg');
        assert.strictEqual(result.nextCalled, true);
        assert.strictEqual(result.statusCode, undefined);
    });

    await t.test('blocks Hidden paths', () => {
        const result = check('/textures/Hidden/LOD/Oak/oak_natural_medium.jpg');
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
    });

    await t.test('blocks Uncategorized paths', () => {
        const result = check('/textures/Uncategorized/temp.png');
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
    });

    await t.test('blocks case-insensitive Hidden', () => {
        const result = check('/textures/hidden/secret.jpg');
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
    });

    await t.test('blocks Hidden as first segment', () => {
        const result = check('Hidden/secret.jpg');
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
    });

    await t.test('does not block partial matches', () => {
        const result = check('/textures/NotHidden/test.jpg');
        assert.strictEqual(result.nextCalled, true);
        assert.strictEqual(result.statusCode, undefined);
    });

    await t.test('handles encoded traversal', () => {
        // Current implementation: split('/') would get ['textures', '..', 'Hidden', 'test.jpg']
        // .some would find 'Hidden'.
        const result = check('/textures/%2e%2e/Hidden/test.jpg');
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
    });

    await t.test('handles malformed URI', () => {
        const result = check('/textures/%E0%A4%A');
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 400);
    });
});
