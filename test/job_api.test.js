const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');
const fs = require('fs');
const path = require('path');

test('GET /api/job endpoints with and without subfolders', async (t) => {
    // Setup dummy job structure
    const jobsDir = path.join(__dirname, '../jobs');
    const dummyJobDir = path.join(jobsDir, 'dummy_123');
    const dummyKitchenDir = path.join(dummyJobDir, 'Kitchen');

    // Create folders
    if (!fs.existsSync(dummyJobDir)) fs.mkdirSync(dummyJobDir, { recursive: true });
    if (!fs.existsSync(dummyKitchenDir)) fs.mkdirSync(dummyKitchenDir, { recursive: true });

    // Create files
    fs.writeFileSync(path.join(dummyKitchenDir, '3d.glb'), '{"mock": true}');
    fs.writeFileSync(path.join(dummyKitchenDir, '3d.textures.json'), '{"mock": true}');
    fs.writeFileSync(path.join(dummyJobDir, 'LivingRoom.glb'), '{"mock": true}');
    fs.writeFileSync(path.join(dummyJobDir, 'LivingRoom.textures.json'), '{"mock": true}');

    await t.test('GET /api/job/:code returns rooms from subfolders and direct files', async () => {
        const res = await request(app).get('/api/job/dummy_123');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.success);
        assert.ok(res.body.rooms.includes('Kitchen'));
        assert.ok(res.body.rooms.includes('LivingRoom'));
    });

    await t.test('GET /api/job/:code/:room returns GLB in subfolder', async () => {
        const res = await request(app).get('/api/job/dummy_123/Kitchen');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.success);
        assert.ok(res.body.url.includes('Kitchen/3d.glb'));
    });

    await t.test('GET /api/job/:code/:room returns GLB directly in job root', async () => {
        const res = await request(app).get('/api/job/dummy_123/LivingRoom');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.success);
        assert.ok(res.body.url.includes('LivingRoom.glb'));
    });

    await t.test('GET /api/job/:code/:room/textures returns textures in subfolder', async () => {
        const res = await request(app).get('/api/job/dummy_123/Kitchen/textures');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/job/:code/:room/textures returns textures directly in job root', async () => {
        const res = await request(app).get('/api/job/dummy_123/LivingRoom/textures');
        assert.strictEqual(res.status, 200);
    });

    // Cleanup
    fs.unlinkSync(path.join(dummyKitchenDir, '3d.glb'));
    fs.unlinkSync(path.join(dummyKitchenDir, '3d.textures.json'));
    fs.unlinkSync(path.join(dummyJobDir, 'LivingRoom.glb'));
    fs.unlinkSync(path.join(dummyJobDir, 'LivingRoom.textures.json'));
    fs.rmdirSync(dummyKitchenDir);
    fs.rmdirSync(dummyJobDir);
});
