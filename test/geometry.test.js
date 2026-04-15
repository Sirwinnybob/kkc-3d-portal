const test = require('node:test');
const assert = require('node:assert');
const { cross2d, parseIndices, bridgeHole, earClip } = require('../utils/geometry');

test('earClip utility function', async (t) => {
    await t.test('returns empty array for less than 3 points', () => {
        assert.deepStrictEqual(earClip([]), []);
        assert.deepStrictEqual(earClip([[0, 0]]), []);
        assert.deepStrictEqual(earClip([[0, 0], [1, 0]]), []);
    });

    await t.test('triangulates a simple triangle', () => {
        const ring = [[0, 0], [10, 0], [0, 10]];
        const result = earClip(ring);
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result[0], [[0, 0], [10, 0], [0, 10]]);
    });

    await t.test('triangulates a simple square (nested array)', () => {
        const ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
        const result = earClip(ring);
        // A square should be 2 triangles
        assert.strictEqual(result.length, 2);
        // The algorithm returns triangles that use the original elements
        assert.deepStrictEqual(result[0], [[0, 10], [0, 0], [10, 0]]);
        assert.deepStrictEqual(result[1], [[10, 0], [10, 10], [0, 10]]);
    });

    await t.test('triangulates a simple square (flat array)', () => {
        const ring = [0, 0, 10, 0, 10, 10, 0, 10];
        const result = earClip(ring);
        assert.strictEqual(result.length, 2);
        assert.deepStrictEqual(result[0], [[0, 10], [0, 0], [10, 0]]);
        assert.deepStrictEqual(result[1], [[10, 0], [10, 10], [0, 10]]);
    });

    await t.test('handles clockwise winding order by reversing', () => {
        const ring = [[0, 0], [0, 10], [10, 10], [10, 0]]; // CW
        const result = earClip(ring);
        assert.strictEqual(result.length, 2);
        // Verify triangles are valid by checking their coordinates
        // The algorithm produces valid triangles for the reversed CCW ring
        assert.deepStrictEqual(result[0], [[0, 0], [10, 0], [10, 10]]);
        assert.deepStrictEqual(result[1], [[10, 10], [0, 10], [0, 0]]);
    });

    await t.test('handles object-based vertices {x, y}', () => {
        const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        const result = earClip(ring);
        assert.strictEqual(result.length, 2);
        assert.deepStrictEqual(result[0], [{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }]);
    });
});

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

test('bridgeHole utility function', async (t) => {
    await t.test('bridges a simple square hole into a square outer ring', () => {
        const outer = [[0, 0], [10, 0], [10, 10], [0, 10]];
        const hole = [[2, 2], [8, 2], [8, 8], [2, 8]];

        // hBest should be index 1 ([8, 2]) - first rightmost
        // oBest should be index 1 ([10, 0]) - first rightmost

        const result = bridgeHole(outer, hole);

        // Expected stitching:
        // outer[0..1] -> [[0,0], [10,0]]
        // hole[1..end] -> [[8,2], [8,8], [2,8]]
        // hole[0..1] -> [[2,2], [8,2]]
        // outer[1..end] -> [[10,0], [10,10], [0,10]]

        const expected = [
            [0, 0], [10, 0],
            [8, 2], [8, 8], [2, 8],
            [2, 2], [8, 2],
            [10, 0], [10, 10], [0, 10]
        ];

        assert.deepStrictEqual(result, expected);
    });

    await t.test('bridges when rightmost points are at non-zero indices', () => {
        // Outer: rightmost is at index 2
        const outer = [[0, 5], [5, 10], [10, 5], [5, 0]];
        // Hole: rightmost is at index 3
        const hole = [[3, 5], [5, 7], [5, 3], [7, 5]];

        // hBest = 3 ([7, 5])
        // oBest = 2 ([10, 5])

        const result = bridgeHole(outer, hole);

        // Expected stitching:
        // outer[0..2] -> [[0, 5], [5, 10], [10, 5]]
        // hole[3..end] -> [[7, 5]]
        // hole[0..3] -> [[3, 5], [5, 7], [5, 3], [7, 5]]
        // outer[2..end] -> [[10, 5], [5, 0]]

        const expected = [
            [0, 5], [5, 10], [10, 5],
            [7, 5],
            [3, 5], [5, 7], [5, 3], [7, 5],
            [10, 5], [5, 0]
        ];

        assert.deepStrictEqual(result, expected);
    });

    await t.test('handles floating point coordinates', () => {
        const outer = [[0.1, 0.1], [10.5, 0.1], [10.5, 10.5], [0.1, 10.5]];
        const hole = [[2.2, 2.2], [8.8, 2.2], [8.8, 8.8], [2.2, 8.8]];

        // hBest = 1 ([8.8, 2.2])
        // oBest = 1 ([10.5, 0.1])

        const result = bridgeHole(outer, hole);

        const expected = [
            [0.1, 0.1], [10.5, 0.1],
            [8.8, 2.2], [8.8, 8.8], [2.2, 8.8],
            [2.2, 2.2], [8.8, 2.2],
            [10.5, 0.1], [10.5, 10.5], [0.1, 10.5]
        ];

        assert.deepStrictEqual(result, expected);
    });
});
