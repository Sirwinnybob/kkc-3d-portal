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
            this.body = msg;
            return this;
        }
    };

    await t.test('allows public textures', () => {
        let calledNext = false;
        const req = { path: '/Wood/Oak.jpg' };
        const res = { ...mockRes };
        const next = () => { calledNext = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(calledNext, true);
        assert.strictEqual(res.statusCode, undefined);
    });

    await t.test('blocks Hidden root access', () => {
        let calledNext = false;
        const req = { path: '/Hidden/secret.jpg' };
        const res = { ...mockRes };
        const next = () => { calledNext = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(calledNext, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('allows Hidden/LOD access', () => {
        let calledNext = false;
        const req = { path: '/Hidden/LOD/Wood/Oak_low.jpg' };
        const res = { ...mockRes };
        const next = () => { calledNext = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(calledNext, true);
        assert.strictEqual(res.statusCode, undefined);
    });

    await t.test('blocks Uncategorized access', () => {
        let calledNext = false;
        const req = { path: '/Uncategorized/private.jpg' };
        const res = { ...mockRes };
        const next = () => { calledNext = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(calledNext, false);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('blocks case-insensitive Hidden access', () => {
        let calledNext = false;
        const req = { path: '/hidden/secret.jpg' };
        const res = { ...mockRes };
        const next = () => { calledNext = true; };

        texturesAuth(req, res, next);
        assert.strictEqual(calledNext, false);
        assert.strictEqual(res.statusCode, 403);
    });
});
