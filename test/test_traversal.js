const assert = require('assert');
const path = require('path');
const { test } = require('node:test');

test('Server traversal logic', () => {
    const JOBS_DIR = '/app/jobs';
    const code = '/app/jobs/../../etc/passwd';
    const safeBase = path.resolve(JOBS_DIR);
    const jobPath = path.resolve(safeBase, path.join('.', code));

    const relative = path.relative(safeBase, jobPath);
    const isForbidden = !relative || relative.startsWith('..') || path.isAbsolute(relative);

    // In original code, it would be /app/jobs/etc/passwd, which is allowed.
    // Wait, let's verify if `path.join('.', code)` makes it safe.
    assert.strictEqual(isForbidden, false, "Should be allowed because it resolves inside safeBase");
});

test('Windows C:\\jobs\\C:\\Windows\\System32 logic', () => {
    const pathWin = require('path').win32;
    const JOBS_DIR = 'C:\\jobs';
    const code = 'C:\\jobs\\..\\Windows\\System32';
    const safeBase = pathWin.resolve(JOBS_DIR);
    const jobPath = pathWin.resolve(safeBase, pathWin.join('.', code));

    const relative = pathWin.relative(safeBase, jobPath);
    const isForbidden = !relative || relative.startsWith('..') || pathWin.isAbsolute(relative);

    assert.strictEqual(isForbidden, true, "Should be forbidden on Windows!");
});
