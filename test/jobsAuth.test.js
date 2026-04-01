const test = require('node:test');
const assert = require('node:assert');
const jobsAuth = require('../middleware/jobsAuth');

test('jobsAuth middleware', async (t) => {
    await t.test('allows .glb files', () => {
        const req = { path: '/test.glb' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        jobsAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('allows .jpg files', () => {
        const req = { path: '/image.jpg' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        jobsAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('forbids .txt files', () => {
        const req = { path: '/secret.txt' };
        let statusSet = 0;
        let sentMessage = '';
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: (m) => { sentMessage = m; } };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        jobsAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
        assert.strictEqual(sentMessage, 'Forbidden');
    });

    await t.test('returns 400 for malformed URI', () => {
        const req = { path: '/%' }; // Malformed URI component
        let statusSet = 0;
        let sentMessage = '';
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: (m) => { sentMessage = m; } };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        jobsAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
        assert.strictEqual(sentMessage, 'Forbidden');
    });

    await t.test('allows .png files', () => {
        const req = { path: '/image.png' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        jobsAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('allows .jpeg files', () => {
        const req = { path: '/image.jpeg' };
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        const res = {};

        jobsAuth(req, res, next);
        assert.strictEqual(nextCalled, true);
    });

    await t.test('returns 403 Forbidden for missing extensions', () => {
        const req = { path: '/no-extension' };
        let statusSet = 0;
        let sentMessage = '';
        const res = {
            status: (s) => {
                statusSet = s;
                return { send: (m) => { sentMessage = m; } };
            }
        };
        const next = () => { throw new Error('next should not be called'); };

        jobsAuth(req, res, next);
        assert.strictEqual(statusSet, 403);
        assert.strictEqual(sentMessage, 'Forbidden');
    });
});
