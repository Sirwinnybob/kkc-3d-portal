const test = require('node:test');
const assert = require('node:assert');
const texturesAuth = require('../middleware/texturesAuth');

test('texturesAuth middleware', async (t) => {
    await t.test('allows normal category path', () => {
        const req = { path: '/Oak/texture.jpg' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('blocks Hidden directory', () => {
        const req = { path: '/Hidden/secret.jpg' };
        let statusSet = 0;
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
    });

    await t.test('blocks Uncategorized directory', () => {
        const req = { path: '/Uncategorized/raw.jpg' };
        let statusSet = 0;
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
    });

    await t.test('allows Hidden/LOD exception', () => {
        const req = { path: '/Hidden/LOD/Oak/texture_low.jpg' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('blocks Uncategorized even if it contains Hidden/LOD', () => {
        // Pathological case to ensure Uncategorized is always blocked
        const req = { path: '/Uncategorized/Hidden/LOD/fake.jpg' };
        let statusSet = 0;
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
    });

    await t.test('blocks hidden in middle of path', () => {
        const req = { path: '/Some/Hidden/Path/file.jpg' };
        let statusSet = 0;
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
    });

    await t.test('returns 400 for malformed URI', () => {
        const req = { path: '/%' };
        let statusSet = 0;
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: () => {} };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        texturesAuth(req, res, next);
        assert.strictEqual(statusSet, 400);
    });
});
