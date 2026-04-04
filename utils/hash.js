/**
 * SWAR (SIMD Within A Register) population count algorithm for 32-bit integers.
 */
const popcount32 = (n) => {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    // Use Math.imul for optimized multiplication on 32-bit integers
    return Math.imul((n + (n >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24;
};

/**
 * Highly optimized Hamming distance between two 64-bit hashes pre-split into 32-bit integers.
 * Uses popcount32 for extreme speedup.
 */
function hammingDistance(h1Low, h1High, h2Low, h2High) {
    // Bitwise XOR (^) on 32-bit chunks in JS automatically converts to 32-bit signed ints.
    // We then use unsigned right shift (>>> 0) to ensure popcount32 handles them as unsigned.
    return popcount32((h1Low ^ h2Low) >>> 0) + popcount32((h1High ^ h2High) >>> 0);
}

module.exports = {
    popcount32,
    hammingDistance
};
