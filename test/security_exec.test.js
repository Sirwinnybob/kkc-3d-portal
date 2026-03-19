const test = require('node:test');
const assert = require('node:assert');
const child_process = require('node:child_process');
const path = require('node:path');

test('execFile argument injection demonstration', (t) => {
    const mockExecFile = t.mock.method(child_process, 'execFile', (file, args, options, callback) => {
        // Just record the arguments
        return { file, args, options };
    });

    const maliciousFilename = '-oHACKED.glb';
    const ASSIMP_PATH = 'assimp';
    const dir = '/tmp';
    const filePath = path.join(dir, maliciousFilename);
    const outputGlb = 'output.glb';

    // Simulated vulnerable call
    child_process.execFile(ASSIMP_PATH, ['export', path.basename(filePath), outputGlb, 'glb2'], { cwd: dir }, () => {});

    const call = mockExecFile.mock.calls[0];
    assert.strictEqual(call.arguments[1][1], maliciousFilename);
    console.log('Vulnerable call arguments:', call.arguments[1]);

    // Demonstration of why it is bad: if maliciousFilename is '-oHACKED.glb',
    // it becomes an argument to assimp, which might be interpreted as an option.
    assert.ok(call.arguments[1][1].startsWith('-'), 'Filename starts with a dash, potentially interpreted as an option');
});

test('Proposed fix: prepending ./ to filenames', (t) => {
    const mockExecFile = t.mock.method(child_process, 'execFile', (file, args, options, callback) => {
        return { file, args, options };
    });

    const maliciousFilename = '-oHACKED.glb';
    const ASSIMP_PATH = 'assimp';
    const dir = '/tmp';
    const filePath = path.join(dir, maliciousFilename);
    const outputGlb = 'output.glb';

    // Proposed fixed call: prepending ./
    const safeInput = './' + path.basename(filePath);
    const safeOutput = './' + outputGlb;

    child_process.execFile(ASSIMP_PATH, ['export', safeInput, safeOutput, 'glb2'], { cwd: dir }, () => {});

    const call = mockExecFile.mock.calls[0];
    assert.strictEqual(call.arguments[1][1], './' + maliciousFilename);
    assert.ok(!call.arguments[1][1].startsWith('-'), 'Filename no longer starts with a dash');
});

test('Proposed fix: regex validation', (t) => {
    const validate = (name) => /^[a-zA-Z0-9\._\- ]+$/.test(name);

    assert.ok(validate('Room 1'));
    assert.ok(validate('my-room_1.dae'));
    assert.ok(!validate('Room; rm -rf /'));
    assert.ok(!validate('Room$(whoami)'));
    assert.ok(!validate('Room`whoami`'));
    assert.ok(!validate('Room|nc'));
});
