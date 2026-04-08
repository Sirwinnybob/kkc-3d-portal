const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { safeShowroomPath, SHOWROOM_DIR } = require('../server');

test('safeShowroomPath unit tests', async (t) => {
    await t.test('Happy Path: valid relative path', () => {
        const result = safeShowroomPath('kitchen', 'base', 'unit.glb');
        const expected = path.join(SHOWROOM_DIR, 'kitchen', 'base', 'unit.glb');
        assert.strictEqual(result, expected);
    });

    await t.test('Multiple segments joined correctly', () => {
        const result = safeShowroomPath('kitchen/base', 'unit.glb');
        const expected = path.join(SHOWROOM_DIR, 'kitchen', 'base', 'unit.glb');
        assert.strictEqual(result, expected);
    });

    await t.test('Traversal attempt with .. should return null', () => {
        const result = safeShowroomPath('..', '..', 'etc', 'passwd');
        assert.strictEqual(result, null);
    });

    await t.test('Partial traversal that stays within bounds should pass', () => {
        const result = safeShowroomPath('kitchen', '..', 'kitchen', 'base.glb');
        const expected = path.join(SHOWROOM_DIR, 'kitchen', 'base.glb');
        assert.strictEqual(result, expected);
    });

    await t.test('Traversal attempt hidden in segments should return null', () => {
        const result = safeShowroomPath('kitchen', '../../../etc/passwd');
        assert.strictEqual(result, null);
    });

    await t.test('Absolute path segment should return null if it escapes SHOWROOM_DIR', () => {
        // path.join(SHOWROOM_DIR, '/etc/passwd') results in path.join(SHOWROOM_DIR, 'etc/passwd') on Windows
        // or SHOWROOM_DIR + '/etc/passwd' on Linux.
        // If it starts with / on Linux, path.join keeps it as a join unless it's the first arg.
        // Actually path.join('/foo', '/bar') -> '/foo/bar'

        // However, path.relative(SHOWROOM_DIR, resolved) will catch if it somehow became absolute outside SHOWROOM_DIR.
        // If resolved is /etc/passwd and SHOWROOM_DIR is /app/Showroom, rel is ../../etc/passwd

        const result = safeShowroomPath('/etc/passwd');
        // On Linux, path.join('/app/Showroom', '/etc/passwd') -> '/app/Showroom/etc/passwd'
        // So it might actually be "safe" in terms of staying inside SHOWROOM_DIR if path.join works that way.
        // Let's see what happens.
        if (result !== null) {
            assert.ok(result.startsWith(SHOWROOM_DIR));
        }
    });

    await t.test('Empty segments returns SHOWROOM_DIR', () => {
        const result = safeShowroomPath();
        assert.strictEqual(result, SHOWROOM_DIR);
    });

    await t.test('Empty string segment returns SHOWROOM_DIR', () => {
        const result = safeShowroomPath('');
        assert.strictEqual(result, SHOWROOM_DIR);
    });
});
