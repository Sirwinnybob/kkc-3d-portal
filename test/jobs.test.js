const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');

test('/jobs middleware tests', async (t) => {
    // Setup: Ensure the jobs directory exists for testing static file serving
    const JOBS_DIR = process.env.JOBS_DIR ? path.resolve(process.env.JOBS_DIR) : path.join(__dirname, '../jobs');
    if (!fs.existsSync(JOBS_DIR)) {
        fs.mkdirSync(JOBS_DIR, { recursive: true });
    }

    // Create a mock glb file to test valid static serving
    const mockGlbPath = path.join(JOBS_DIR, 'test_mock.glb');
    fs.writeFileSync(mockGlbPath, 'mock glb content');

    // Create a mock invalid file to test extension blocking
    const mockTxtPath = path.join(JOBS_DIR, 'test_mock.txt');
    fs.writeFileSync(mockTxtPath, 'mock txt content');

    t.after(() => {
        // Cleanup mock files
        if (fs.existsSync(mockGlbPath)) fs.unlinkSync(mockGlbPath);
        if (fs.existsSync(mockTxtPath)) fs.unlinkSync(mockTxtPath);
    });

    await t.test('returns 400 Bad Request for malformed URI (decodeURIComponent error)', async () => {
        // %E0%A4%A is an invalid UTF-8 sequence and will cause decodeURIComponent to throw
        const response = await request(app).get('/jobs/malformed%E0%A4%A');
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.text, 'Bad Request');
    });

    await t.test('returns 400 Bad Request for single percent sign in URI (decodeURIComponent error)', async () => {
        const response = await request(app).get('/jobs/invalid%uri.glb');
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.text, 'Bad Request');
    });

    await t.test('returns 400 Bad Request for truncated percent encoding (decodeURIComponent error)', async () => {
        const response = await request(app).get('/jobs/test%E0');
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.text, 'Bad Request');
    });

    await t.test('returns 403 Forbidden for unauthorized file types', async () => {
        const response = await request(app).get('/jobs/test_mock.txt');
        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.text, 'Forbidden');
    });

    await t.test('returns 403 Forbidden for missing extensions', async () => {
        const response = await request(app).get('/jobs/test_mock');
        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.text, 'Forbidden');
    });

    await t.test('serves authorized file types (e.g. .glb) correctly', async () => {
        const response = await request(app).get('/jobs/test_mock.glb');
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.text, 'mock glb content');
    });

    await t.test('returns 404 for authorized file type that does not exist', async () => {
        const response = await request(app).get('/jobs/does_not_exist.glb');
        assert.strictEqual(response.status, 404);
    });
});
