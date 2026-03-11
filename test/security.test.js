const path = require('path');
const assert = require('assert');

// Mock JOBS_DIR for testing logic
const JOBS_DIR = '/app/jobs';
const safeBase = path.resolve(JOBS_DIR);

function resolveJobPath(code) {
    return path.resolve(safeBase, path.join('.', code));
}

function resolveRoomPath(jobPath, room) {
    return path.resolve(jobPath, path.join('.', room));
}

function checkTraversal(jobPath, roomPath) {
    const isJobSafe = jobPath.startsWith(safeBase + path.sep);
    const isRoomSafe = roomPath ? roomPath.startsWith(jobPath + path.sep) : true;
    return isJobSafe && isRoomSafe;
}

const tests = [
    { name: 'Normal job', code: 'job1', expectedSafe: true },
    { name: 'Job with dots', code: 'job.1', expectedSafe: true },
    { name: 'Relative traversal', code: '../../etc/passwd', expectedSafe: false },
    { name: 'Absolute path', code: '/etc/passwd', expectedSafe: true, comment: 'Should be resolved to /app/jobs/etc/passwd' },
    { name: 'Absolute path to base', code: '/app/jobs/secret', expectedSafe: true, comment: 'Resolved to /app/jobs/app/jobs/secret' },
    { name: 'Room normal', code: 'job1', room: 'room1', expectedSafe: true },
    { name: 'Room traversal', code: 'job1', room: '../../etc/passwd', expectedSafe: false },
];

console.log('Running security logic tests...');
let failed = 0;

tests.forEach(t => {
    const jobPath = resolveJobPath(t.code);
    const roomPath = t.room ? resolveRoomPath(jobPath, t.room) : null;
    const isSafe = checkTraversal(jobPath, roomPath);

    try {
        assert.strictEqual(isSafe, t.expectedSafe, `${t.name} failed: expected safe=${t.expectedSafe}, got ${isSafe}`);
        console.log(`[PASS] ${t.name}`);
    } catch (e) {
        console.log(`[FAIL] ${e.message}`);
        console.log(`  code: ${t.code}, room: ${t.room}`);
        console.log(`  jobPath: ${jobPath}`);
        console.log(`  roomPath: ${roomPath}`);
        failed++;
    }
});

if (failed > 0) {
    console.log(`\nTests failed: ${failed}`);
    process.exit(1);
} else {
    console.log('\nAll security logic tests passed!');
}
