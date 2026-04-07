const { performance } = require('perf_hooks');

const library = {};
for (let c = 0; c < 20; c++) {
    const category = `cat_${c}`;
    library[category] = [];
    for (let t = 0; t < 100; t++) {
        library[category].push({
            name: `tex_${t}`,
            hLow: Math.random() * 0xFFFFFFFF >>> 0,
            hHigh: Math.random() * 0xFFFFFFFF >>> 0,
            hidden: false
        });
    }
}

// Mimic what's in buildTextureHashIndex
const flatLibrary = [];
for (const [category, textures] of Object.entries(library)) {
    for (const tex of textures) {
        flatLibrary.push({ ...tex, category });
    }
}
const flatLow = new Uint32Array(flatLibrary.length);
const flatHigh = new Uint32Array(flatLibrary.length);
for (let i = 0; i < flatLibrary.length; i++) {
    flatLow[i] = flatLibrary[i].hLow;
    flatHigh[i] = flatLibrary[i].hHigh;
}

function popcount32(n) {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return Math.imul((n + (n >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24;
}

function hammingDistance(h1Low, h1High, h2Low, h2High) {
    return popcount32((h1Low ^ h2Low) >>> 0) + popcount32((h1High ^ h2High) >>> 0);
}

const inLow = Math.random() * 0xFFFFFFFF >>> 0;
const inHigh = Math.random() * 0xFFFFFFFF >>> 0;

function benchmarkOld() {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
        let bestDistance = Infinity;
        for (const [category, textures] of Object.entries(library)) {
            for (const tex of textures) {
                const distance = hammingDistance(inLow, inHigh, tex.hLow, tex.hHigh);
                if (distance < bestDistance) bestDistance = distance;
            }
        }
    }
    return performance.now() - start;
}

function benchmarkNew() {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
        let bestDistance = Infinity;
        for (let j = 0; j < _flatLow.length; j++) {
            const distance = popcount32((inLow ^ _flatLow[j]) >>> 0) +
                             popcount32((inHigh ^ _flatHigh[j]) >>> 0);
            if (distance < bestDistance) bestDistance = distance;
        }
    }
    return performance.now() - start;
}

// Variables for benchmarkNew
const _flatLow = flatLow;
const _flatHigh = flatHigh;

const oldTime = benchmarkOld();
const newTime = benchmarkNew();

console.log(`Nested Loops (O(N)): ${oldTime.toFixed(2)}ms`);
console.log(`Flat TypedArray (O(N)): ${newTime.toFixed(2)}ms`);
console.log(`Speedup: ${(oldTime / newTime).toFixed(2)}x`);
