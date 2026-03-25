const test = require('node:test');
const assert = require('node:assert');
const { hammingDistance, popcount32 } = require('../utils/hash');

test('popcount32 algorithm', async (t) => {
    await t.test('returns 0 for 0', () => {
        assert.strictEqual(popcount32(0), 0);
    });

    await t.test('returns 32 for 0xFFFFFFFF', () => {
        assert.strictEqual(popcount32(0xFFFFFFFF >>> 0), 32);
    });

    await t.test('returns 16 for 0x55555555', () => {
        assert.strictEqual(popcount32(0x55555555 >>> 0), 16);
    });

    await t.test('returns 16 for 0xAAAAAAAA', () => {
        assert.strictEqual(popcount32(0xAAAAAAAA >>> 0), 16);
    });

    await t.test('returns 1 for 1', () => {
        assert.strictEqual(popcount32(1), 1);
    });

    await t.test('returns 1 for 0x80000000', () => {
        assert.strictEqual(popcount32(0x80000000 >>> 0), 1);
    });

    await t.test('handles signed integers correctly via unsigned shift in hammingDistance', () => {
        // -1 in signed 32-bit is 0xFFFFFFFF
        assert.strictEqual(popcount32(-1 >>> 0), 32);
    });
});

test('hammingDistance function', async (t) => {
    await t.test('returns 0 for identical hashes', () => {
        assert.strictEqual(hammingDistance(0, 0, 0, 0), 0);
        assert.strictEqual(hammingDistance(0x12345678, 0x9ABCDEF0, 0x12345678, 0x9ABCDEF0), 0);
        assert.strictEqual(hammingDistance(-1, -1, -1, -1), 0);
    });

    await t.test('returns 64 for completely different hashes', () => {
        assert.strictEqual(hammingDistance(0, 0, 0xFFFFFFFF, 0xFFFFFFFF), 64);
        assert.strictEqual(hammingDistance(0x55555555, 0x55555555, 0xAAAAAAAA, 0xAAAAAAAA), 64);
    });

    await t.test('returns 1 for a single bit difference', () => {
        assert.strictEqual(hammingDistance(1, 0, 0, 0), 1);
        assert.strictEqual(hammingDistance(0, 1, 0, 0), 1);
        assert.strictEqual(hammingDistance(0x80000000, 0, 0, 0), 1);
    });

    await t.test('calculates correct distance for mixed bits', () => {
        // 0x01 (0001) vs 0x02 (0010) = 2 bits difference
        assert.strictEqual(hammingDistance(0x01, 0, 0x02, 0), 2);
        // 0x03 (0011) vs 0x01 (0001) = 1 bit difference
        assert.strictEqual(hammingDistance(0, 0x03, 0, 0x01), 1);
    });

    await t.test('handles large unsigned values correctly', () => {
        const h1Low = 0x12345678;
        const h1High = 0x87654321;
        const h2Low = 0x12345679; // 1 bit different from h1Low
        const h2High = 0x87654320; // 1 bit different from h1High
        assert.strictEqual(hammingDistance(h1Low, h1High, h2Low, h2High), 2);
    });
});
