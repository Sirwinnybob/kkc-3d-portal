const test = require('node:test');
const assert = require('node:assert');
const texturesAuth = require('../middleware/texturesAuth');

test('texturesAuth middleware', async (t) => {
    await t.test('allows normal texture path', () => {
        const req = { path: '/Kitchen/Oak.jpg' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('allows encoded normal texture path', () => {
        const req = { path: '/Kitchen/White%20Oak.jpg' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        texturesAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('forbids Hidden directory', () => {
        const req = { path: '/Hidden/some_file.jpg' };
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

    await t.test('forbids Uncategorized directory', () => {
        const req = { path: '/Uncategorized/some_file.jpg' };
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

    await t.test('forbids hidden in middle of path', () => {
        const req = { path: '/Some/Hidden/File.jpg' };
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

    await t.test('forbids uncategorized in middle of path', () => {
        const req = { path: '/Some/Uncategorized/File.jpg' };
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

    await t.test('forbids /Hidden/LOD/ path (security boundary test)', () => {
        const req = { path: '/Hidden/LOD/Kitchen/Oak_low.jpg' };
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
});
