const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

const BENCHMARK_DIR = path.join(os.tmpdir(), 'kkc_benchmark_dir');
const FILE_COUNT = 10000;

// Setup test files
function setup() {
    if (fs.existsSync(BENCHMARK_DIR)) {
        fs.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(BENCHMARK_DIR, { recursive: true });

    for (let i = 0; i < FILE_COUNT; i++) {
        const roomDir = path.join(BENCHMARK_DIR, `room_${i}`);
        fs.mkdirSync(roomDir);

        const daePath = path.join(roomDir, '3D.dae');
        fs.writeFileSync(daePath, 'dummy data');

        if (i % 2 === 0) {
            const glbPath = path.join(roomDir, `room_${i}.glb`);
            fs.writeFileSync(glbPath, 'dummy data');

            if (i % 4 === 0) {
                const time = new Date(Date.now() - 10000);
                fs.utimesSync(glbPath, time, time); // older
            }
        }
    }
}

// Original Synchronous Implementation
const syncConversionQueue = [];
let syncPendingTimers = new Map();
function syncConvertDesign(filePath, skipTimer = false) {
    if (path.extname(filePath).toLowerCase() !== '.dae') return;
    const roomDir = path.dirname(filePath);
    const roomName = path.basename(roomDir);
    const glbPath = path.join(roomDir, `${roomName}.glb`);
    if (fs.existsSync(glbPath)) {
        const daeTime = fs.statSync(filePath).mtimeMs;
        const glbTime = fs.statSync(glbPath).mtimeMs;
        if (glbTime > daeTime) return;
    }
    if (skipTimer) {
        syncConversionQueue.push({ filePath });
        return;
    }
    if (syncPendingTimers.has(roomDir)) clearTimeout(syncPendingTimers.get(roomDir));
    syncPendingTimers.set(roomDir, setTimeout(() => {
        syncPendingTimers.delete(roomDir);
        syncConversionQueue.push({ filePath });
    }, 15000));
}

// Proposed Asynchronous Implementation
const asyncConversionQueue = [];
let asyncPendingTimers = new Map();
async function asyncConvertDesign(filePath, skipTimer = false) {
    if (path.extname(filePath).toLowerCase() !== '.dae') return;
    const roomDir = path.dirname(filePath);
    const roomName = path.basename(roomDir);
    const glbPath = path.join(roomDir, `${roomName}.glb`);

    // Using exists + stat instead of two stats to avoid exception handling overhead
    // which Node 20+ handles better, but let's compare exists/stat approach
    // with promises
    try {
        const hasGlb = await fs.promises.access(glbPath, fs.constants.F_OK).then(() => true).catch(() => false);
        if (hasGlb) {
            const [daeStat, glbStat] = await Promise.all([
                fs.promises.stat(filePath),
                fs.promises.stat(glbPath)
            ]);
            if (glbStat.mtimeMs > daeStat.mtimeMs) return;
        }
    } catch (e) {
        console.error(e)
    }

    if (skipTimer) {
        asyncConversionQueue.push({ filePath });
        return;
    }
    if (asyncPendingTimers.has(roomDir)) clearTimeout(asyncPendingTimers.get(roomDir));
    asyncPendingTimers.set(roomDir, setTimeout(() => {
        asyncPendingTimers.delete(roomDir);
        asyncConversionQueue.push({ filePath });
    }, 15000));
}

let maxEventLoopDelay = 0;
let lastTick = performance.now();
const interval = setInterval(() => {
    const now = performance.now();
    const delay = now - lastTick;
    if (delay > maxEventLoopDelay) {
        maxEventLoopDelay = delay;
    }
    lastTick = now;
}, 5);

async function runBenchmark() {
    console.log(`Setting up ${FILE_COUNT} test files...`);
    setup();

    const filesToProcess = [];
    for (let i = 0; i < FILE_COUNT; i++) {
        filesToProcess.push(path.join(BENCHMARK_DIR, `room_${i}`, '3D.dae'));
    }

    console.log('--- Running Synchronous Benchmark ---');
    maxEventLoopDelay = 0;
    lastTick = performance.now();
    const syncStart = performance.now();
    for (const file of filesToProcess) {
        syncConvertDesign(file, true);
    }
    const syncEnd = performance.now();
    // Wait for the next tick to catch any remaining block
    await new Promise(resolve => setTimeout(resolve, 10));

    console.log(`Synchronous processing blocked the event loop for a max chunk of: ${maxEventLoopDelay.toFixed(2)} ms`);
    console.log(`Total wall time: ${(syncEnd - syncStart).toFixed(2)} ms`);

    console.log('--- Running Asynchronous Benchmark ---');
    maxEventLoopDelay = 0;
    lastTick = performance.now();
    const asyncStart = performance.now();

    // Instead of launching 10,000 promises at once (which thrashes the event loop queue),
    // we should process them in a way that allows the event loop to breathe.
    const promises = [];
    for (const file of filesToProcess) {
        promises.push(asyncConvertDesign(file, true));
        // Yield occasionally if we were a massive queue
        if (promises.length % 100 === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }
    }

    await Promise.all(promises);
    const asyncEnd = performance.now();
    await new Promise(resolve => setTimeout(resolve, 10));

    console.log(`Asynchronous processing blocked the event loop for a max chunk of: ${maxEventLoopDelay.toFixed(2)} ms`);
    console.log(`Total wall time: ${(asyncEnd - asyncStart).toFixed(2)} ms`);

    if (syncConversionQueue.length !== asyncConversionQueue.length) {
        console.error(`CRITICAL: Queues do not match in length! Sync: ${syncConversionQueue.length}, Async: ${asyncConversionQueue.length}`);
    }

    fs.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
    clearInterval(interval);
}

runBenchmark().catch(console.error);
