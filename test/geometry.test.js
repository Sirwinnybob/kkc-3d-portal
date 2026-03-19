const test = require('node:test');
const assert = require('node:assert');
const { cross2d, parseIndices } = require('../utils/geometry');

test('parseIndices utility function', async (t) => {
    await t.test('parses a simple space-delimited string with stride 1', () => {
        const text = "1 2 3";
        const result = parseIndices(text, 1);
        assert.deepStrictEqual(result, [[1], [2], [3]]);
    });

    await t.test('parses indices with stride 3', () => {
        const text = "0 1 2 3 4 5";
        const result = parseIndices(text, 3);
        assert.deepStrictEqual(result, [[0, 1, 2], [3, 4, 5]]);
    });

    await t.test('handles extra whitespace and newlines', () => {
        const text = "  10  20 \n 30\t40  ";
        const result = parseIndices(text, 2);
        assert.deepStrictEqual(result, [[10, 20], [30, 40]]);
    });

    await t.test('handles non-multiple lengths by slicing correctly', () => {
        const text = "1 2 3 4 5";
        const result = parseIndices(text, 2);
        // [1, 2, 3, 4, 5] with stride 2
        // i=0: slice(0, 2) -> [1, 2]
        // i=2: slice(2, 4) -> [3, 4]
        // i=4: slice(4, 6) -> [5]
        assert.deepStrictEqual(result, [[1, 2], [3, 4], [5]]);
    });

    await t.test('handles empty or whitespace-only input (current behavior returns [[0]])', () => {
        // Based on the current implementation:
        // "".trim() -> ""
        // "".split(/\s+/) -> [""]
        // [""].map(Number) -> [0]
        // loop runs once (i=0, stride=1), tuples.push([0])
        assert.deepStrictEqual(parseIndices("", 1), [[0]]);
        assert.deepStrictEqual(parseIndices("   ", 3), [[0]]);
    });
});

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
