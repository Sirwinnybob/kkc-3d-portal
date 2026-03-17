const test = require('node:test');
const assert = require('node:assert');
const { cross2d, pointInTriangle } = require('../utils/geometry');

test('cross2d utility function', async (t) => {
    await t.test('returns positive value for counter-clockwise points', () => {
        const oa = [0, 0], ob = [1, 0], oc = [0, 1];
        const result = cross2d(oa, ob, oc);
        assert.ok(result > 0, `Expected positive, got ${result}`);
    });

    await t.test('returns negative value for clockwise points', () => {
        const oa = [0, 0], ob = [0, 1], oc = [1, 0];
        const result = cross2d(oa, ob, oc);
        assert.ok(result < 0, `Expected negative, got ${result}`);
    });

    await t.test('returns zero for collinear points', () => {
        const oa = [0, 0], ob = [1, 0], oc = [2, 0];
        const result = cross2d(oa, ob, oc);
        assert.strictEqual(result, 0);
    });

    await t.test('returns zero for identical points', () => {
        const oa = [1, 1], ob = [1, 1], oc = [1, 1];
        const result = cross2d(oa, ob, oc);
        assert.strictEqual(result, 0);
    });
});

test('pointInTriangle utility function', async (t) => {
    const a = [0, 0], b = [2, 0], c = [0, 2];

    await t.test('returns true for point strictly inside the triangle', () => {
        const p = [0.5, 0.5];
        assert.strictEqual(pointInTriangle(p, a, b, c), true);
    });

    await t.test('returns true for point on an edge', () => {
        const p = [1, 0];
        assert.strictEqual(pointInTriangle(p, a, b, c), true);
    });

    await t.test('returns true for point on a vertex', () => {
        const p = [0, 0];
        assert.strictEqual(pointInTriangle(p, a, b, c), true);
    });

    await t.test('returns false for point outside the triangle', () => {
        const p = [2, 2];
        assert.strictEqual(pointInTriangle(p, a, b, c), false);
    });

    await t.test('returns true for point inside triangle with clockwise orientation', () => {
        // Same triangle but clockwise: a=[0,0], b=[0,2], c=[2,0]
        const a_cw = [0, 0], b_cw = [0, 2], c_cw = [2, 0];
        const p = [0.5, 0.5];
        assert.strictEqual(pointInTriangle(p, a_cw, b_cw, c_cw), true);
    });
});
