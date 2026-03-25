
const { performance } = require('perf_hooks');

// Original implementation
function original_hammingDistance(hash1, hash2) {
    const diff = hash1 ^ hash2;
    const low = Number(diff & 0xFFFFFFFFn);
    const high = Number(diff >> 32n);
    const popcount32 = (n) => {
        n = n - ((n >>> 1) & 0x55555555);
        n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
        return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
    };
    return popcount32(low) + popcount32(high);
}

// Optimized implementation
const popcount32 = (n) => {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
};

function optimized_hammingDistance(h1Low, h1High, h2Low, h2High) {
    return popcount32((h1Low ^ h2Low) >>> 0) + popcount32((h1High ^ h2High) >>> 0);
}

const ITERATIONS = 1000000;
const hashes = Array.from({ length: 1000 }, () => {
    const big = BigInt("0x" + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join(''));
    return {
        big: big,
        str: big.toString()
    };
});

// Pre-process for optimized
const preprocessed = hashes.map(h => ({
    low: Number(h.big & 0xFFFFFFFFn),
    high: Number(h.big >> 32n)
}));

console.log(`Running benchmark with ${ITERATIONS} iterations...`);

// Test Original
const start1 = performance.now();
let dummy1 = 0;
for (let i = 0; i < ITERATIONS; i++) {
    const h1 = hashes[i % 1000];
    const h2 = hashes[(i + 1) % 1000];
    const b1 = BigInt(h1.str); // Simulate parsing from index
    const b2 = BigInt(h2.str);
    dummy1 += original_hammingDistance(b1, b2);
}
const end1 = performance.now();
console.log(`Original: ${(end1 - start1).toFixed(2)}ms (result: ${dummy1})`);

// Test Optimized
const start2 = performance.now();
let dummy2 = 0;
for (let i = 0; i < ITERATIONS; i++) {
    const h1 = preprocessed[i % 1000];
    const h2 = preprocessed[(i + 1) % 1000];
    dummy2 += optimized_hammingDistance(h1.low, h1.high, h2.low, h2.high);
}
const end2 = performance.now();
console.log(`Optimized: ${(end2 - start2).toFixed(2)}ms (result: ${dummy2})`);

console.log(`Speedup: ${(end1 / end2).toFixed(2)}x`);
