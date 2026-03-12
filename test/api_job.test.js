const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');

test('GET /api/job/:code endpoint tests (mocked fs)', async (t) => {
    // Determine jobs dir path
    const JOBS_DIR = process.env.JOBS_DIR ? path.resolve(process.env.JOBS_DIR) : path.join(__dirname, '../jobs');

    t.afterEach(() => {
        // Restore all mocks after each test
        test.mock.restoreAll();
    });

    await t.test('returns 404 for job code that does not exist', async () => {
        // Mock fs.existsSync (for the prompt's snippet version)
        test.mock.method(fs, 'existsSync', () => false);

        // Mock fs.promises.access (for the actual codebase version)
        test.mock.method(fs.promises, 'access', async () => {
            throw new Error('ENOENT');
        });

        const response = await request(app).get('/api/job/valid_job_code');
        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.success, false);
    });

    await t.test('returns 200 and empty rooms array for job directory without .glb files', async () => {
        // Mock existsSync and access to succeed
        test.mock.method(fs, 'existsSync', () => true);
        test.mock.method(fs.promises, 'access', async () => {});

        // Mock all variants of readdir to return empty array
        test.mock.method(fs.promises, 'readdir', async () => []);
        test.mock.method(fs, 'readdirSync', () => []);
        test.mock.method(fs, 'readdir', (dir, opts, cb) => {
            if (typeof opts === 'function') {
                opts(null, []);
            } else {
                cb(null, []);
            }
        });

        const response = await request(app).get('/api/job/empty_job_test');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.deepStrictEqual(response.body.rooms, []);
    });

    await t.test('returns 200 and recursively finds .glb files with unique names', async () => {
        // Mock existsSync and access to succeed
        test.mock.method(fs, 'existsSync', () => true);
        test.mock.method(fs.promises, 'access', async () => {});

        // Create mock Dirent class to simulate fs.Dirent behavior
        class MockDirent {
            constructor(name, isDir) {
                this.name = name;
                this._isDir = isDir;
            }
            isDirectory() { return this._isDir; }
        }

        const jobPath = path.resolve(JOBS_DIR, 'mocked_job_123');
        const subDirPath = path.join(jobPath, 'sub');

        const mockReaddirFn = (dir) => {
            if (dir === jobPath) {
                return [
                    new MockDirent('room_a.glb', false),
                    new MockDirent('not_a_glb.txt', false),
                    new MockDirent('sub', true)
                ];
            } else if (dir === subDirPath) {
                return [
                    new MockDirent('room_b.glb', false),
                    // duplicate room name to test uniqueness
                    new MockDirent('room_a.glb', false),
                    new MockDirent('room_c.glb', false)
                ];
            }
            return [];
        };

        // Mock readdir to return files and directories, simulating recursion
        test.mock.method(fs.promises, 'readdir', async (dir) => mockReaddirFn(dir));
        test.mock.method(fs, 'readdirSync', (dir) => mockReaddirFn(dir));
        test.mock.method(fs, 'readdir', (dir, opts, cb) => {
            const callback = typeof opts === 'function' ? opts : cb;
            callback(null, mockReaddirFn(dir));
        });

        const response = await request(app).get('/api/job/mocked_job_123');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);

        // Expected rooms: room_a, room_b, room_c
        const expectedRooms = ['room_a', 'room_b', 'room_c'].sort();
        const actualRooms = response.body.rooms.sort();
        assert.deepStrictEqual(actualRooms, expectedRooms);
    });

    await t.test('returns 403 Forbidden for path traversal (bypassing route validation)', async () => {
        // The regex prevents normal path traversal string inputs.
        // To strictly cover the "403 Forbidden" code branch, we mock path logic.

        // Mock path.relative for the current codebase
        test.mock.method(path, 'relative', (from, to) => {
            return '../traversal_simulated';
        });

        // Mock path.resolve for the prompt snippet's version (jobPath.startsWith check)
        const originalResolve = path.resolve;
        test.mock.method(path, 'resolve', (...args) => {
            if (args.length === 2 && args[1] === 'valid_code') {
                return '/unsafe/traversal/simulated'; // Ensures startsWith(safeBase) is false
            }
            return originalResolve(...args);
        });

        const response = await request(app).get('/api/job/valid_code');
        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Forbidden');
    });
});
