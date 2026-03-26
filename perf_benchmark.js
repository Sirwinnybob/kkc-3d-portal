const { performance } = require('perf_hooks');

// Generate large test data
const M = 10000; // currentCategoryTextures size
const N = 500;   // similarTextures size

const currentCategoryTextures = Array.from({ length: M }, (_, i) => ({ url: `url_${i}` }));
const similarTextures = Array.from({ length: N }, (_, i) => ({ url: `url_${i + M - 50}` }));

function benchmarkOld() {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        const uniqueSimilar = similarTextures.filter(t => !currentCategoryTextures.some(ct => ct.url === t.url));
        const combined = [...uniqueSimilar, ...currentCategoryTextures];
    }
    const end = performance.now();
    return (end - start) / 100;
}

function benchmarkNew() {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        const existingUrls = new Set(currentCategoryTextures.map(ct => ct.url));
        const uniqueSimilar = similarTextures.filter(t => !existingUrls.has(t.url));
        const combined = [...uniqueSimilar, ...currentCategoryTextures];
    }
    const end = performance.now();
    return (end - start) / 100;
}

const oldTime = benchmarkOld();
const newTime = benchmarkNew();

console.log(`Baseline (O(N*M)): ${oldTime.toFixed(4)} ms`);
console.log(`Optimized (O(N+M)): ${newTime.toFixed(4)} ms`);
console.log(`Speedup: ${(oldTime / newTime).toFixed(2)}x`);
