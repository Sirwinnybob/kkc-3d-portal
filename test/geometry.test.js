const test = require('node:test');
const assert = require('node:assert');
const { cross2d } = require('../utils/geometry');

test('cross2d utility function', async (t) => {
    await t.test('calculates positive cross product for counter-clockwise points', () => {
        const oa = [0, 0];
        const ob = [1, 0];
        const oc = [0, 1];
        // (1-0)*(1-0) - (0-0)*(0-0) = 1*1 - 0 = 1
        const result = cross2d(oa, ob, oc);
        assert.strictEqual(result, 1);
        assert.ok(result > 0);
    });

    await t.test('calculates negative cross product for clockwise points', () => {
        const oa = [0, 0];
        const ob = [0, 1];
        const oc = [1, 0];
        // (0-0)*(0-0) - (1-0)*(1-0) = 0 - 1 = -1
        const result = cross2d(oa, ob, oc);
        assert.strictEqual(result, -1);
        assert.ok(result < 0);
    });

    await t.test('calculates zero for collinear points', () => {
        const oa = [0, 0];
        const ob = [1, 1];
        const oc = [2, 2];
        // (1-0)*(2-0) - (1-0)*(2-0) = 1*2 - 1*2 = 0
        const result = cross2d(oa, ob, oc);
        assert.strictEqual(result, 0);
    });

    await t.test('calculates zero when two points are identical', () => {
        const oa = [0, 0];
        const ob = [0, 0];
        const oc = [1, 1];
        const result = cross2d(oa, ob, oc);
        assert.strictEqual(result, 0);
    });

    await t.test('handles larger coordinates correctly', () => {
        const oa = [100, 100];
        const ob = [200, 100];
        const oc = [100, 200];
        // (200-100)*(200-100) - (100-100)*(100-100) = 100*100 - 0 = 10000
        const result = cross2d(oa, ob, oc);
        assert.strictEqual(result, 10000);
    });
});
