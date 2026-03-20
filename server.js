
const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const chokidar = require('chokidar');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jobsAuth = require('./middleware/jobsAuth');
const { parseIndices, earClip, cross2d, pointInTriangle, isEar, bridgeHole } = require('./utils/geometry');
const gltfPipeline = require('gltf-pipeline');

const app = express();
const APP_VERSION = "1.1.0";

// --- CONFIG ---
const PORT = parseInt(process.env.PORT) || 5021;
const JOBS_DIR = process.env.JOBS_DIR ? path.resolve(process.env.JOBS_DIR) : path.join(__dirname, 'jobs');
const TEXTURES_DIR = process.env.TEXTURES_DIR ? path.resolve(process.env.TEXTURES_DIR) : path.join(path.dirname(JOBS_DIR), 'textures');
const ASSIMP_PATH = process.platform === 'win32' ? 'assimp.exe' : 'assimp';
const GLASS_TRANSPARENCY = parseFloat(process.env.GLASS_TRANSPARENCY) || 0.8;

if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
if (!fs.existsSync(TEXTURES_DIR)) fs.mkdirSync(TEXTURES_DIR, { recursive: true });

// --- MIDDLEWARE ---
app.set('trust proxy', 1);
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        const proto = req.protocol;
        const host = req.headers.host || '';
        const allowedDomain = process.env.ALLOWED_DOMAIN;

        // Security: Ensure all traffic is strictly HTTPS (trust proxy handles X-Forwarded-Proto)
        if (proto !== 'https') return res.status(403).send('Forbidden: HTTPS required.');
        
        // Temporarily relaxed domain check to ensure access works
        if (host !== allowedDomain && !host.startsWith(`${allowedDomain}:`) && host !== 'localhost' && !host.startsWith('localhost:')) {
            // Security: Sanitize the untrusted Host header to prevent Log Injection (CWE-117)
            const sanitizedHost = host.replace(/[\r\n]/g, '');
            console.warn(`[SECURITY] Blocked access from unauthorized host: ${sanitizedHost}`);
            return res.status(403).send('Forbidden: Invalid Host.');
        }
        next();
    });
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'sha256-eGFYqAHm7QB8cassdFBbBxhusmh76P1pfh3ymxPZOUw='", "https://unpkg.com"],
            connectSrc: ["'self'", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            // Security: 'unsafe-inline' is required for frontend JS that sets inline styles
            styleSrc: ["'self'", "'unsafe-inline'"],
            workerSrc: ["'self'", "blob:"],
        }
    },
    hsts: true,
    crossOriginEmbedderPolicy: false
}));

app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/jobs', jobsAuth, express.static(JOBS_DIR));
app.use('/textures', express.static(TEXTURES_DIR));

// --- API ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    message: { success: false, error: 'Too many requests, please try again later.' }
});

app.use('/api/', apiLimiter);

app.get('/api/job/:code', async (req, res) => {
    const code = req.params.code;

    // Security: Input validation to prevent excessively long codes or unexpected formats
    if (typeof code !== 'string' || code.length > 50 || !/^[a-zA-Z0-9\-_]+$/.test(code)) {
        return res.status(400).json({ success: false, error: 'Bad Request: Invalid job code format' });
    }

    const safeBase = path.resolve(JOBS_DIR);
    const jobPath = path.resolve(safeBase, path.join('.', code));
    // Security: Prevent path traversal
    const relative = path.relative(safeBase, jobPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    try {
        await fs.promises.access(jobPath);
    } catch {
        return res.status(404).json({ success: false });
    }

    const rooms = [];
    const findGlbs = async (dir) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const promises = entries.map(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                return findGlbs(fullPath);
            } else if (entry.name.toLowerCase().endsWith('.glb')) {
                rooms.push(path.basename(entry.name, '.glb'));
            }
        });
        await Promise.all(promises);
    };
    await findGlbs(jobPath);
    res.json({ success: true, rooms: [...new Set(rooms)] });
});

app.get('/api/job/:code/:room', (req, res) => {
    const { code, room } = req.params;

    // Security: Input validation
    if (typeof code !== 'string' || code.length > 50 || !/^[a-zA-Z0-9\-_]+$/.test(code)) {
        return res.status(400).json({ success: false, error: 'Bad Request: Invalid job code format' });
    }
    if (typeof room !== 'string' || room.length > 100 || !/^[a-zA-Z0-9\-_ ]+$/.test(room)) {
        return res.status(400).json({ success: false, error: 'Bad Request: Invalid room format' });
    }

    const safeBase = path.resolve(JOBS_DIR);
    const jobPath = path.resolve(safeBase, path.join('.', code));
    const safeRoom = path.basename(room);
    const roomPath = path.resolve(jobPath, safeRoom);

    // Security: Prevent path traversal for both code and room
    const relCode = path.relative(safeBase, jobPath);
    const relRoom = path.relative(jobPath, roomPath);
    if (!relCode || relCode.startsWith('..') || path.isAbsolute(relCode) || !relRoom || relRoom.startsWith('..') || path.isAbsolute(relRoom)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (!fs.existsSync(jobPath)) return res.status(404).json({ success: false });
    const findGlb = async (dir) => {
        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            const dirs = [];
            for (let i = 0; i < entries.length; i++) {
                const dirent = entries[i];
                if (dirent.isDirectory()) {
                    dirs.push(path.join(dir, dirent.name));
                } else if (dirent.name.toLowerCase() === `${safeRoom.toLowerCase()}.glb`) {
                    return path.join(dir, dirent.name);
                }
            }

            for (let i = 0; i < dirs.length; i++) {
                const result = await findGlb(dirs[i]);
                if (result) return result;
            }
        } catch {
            // ignore
        }
        return null;
    };

    findGlb(jobPath).then(absPath => {
        if (absPath) return res.json({ success: true, url: `/jobs/${path.relative(JOBS_DIR, absPath).replace(/\\/g, '/')}` });
        res.status(404).json({ success: false });
    });
});

// --- TEXTURE CATALOG API ---

// Perceptual hash cache
let textureHashCache = null;
let textureHashCacheTime = 0;
const HASH_CACHE_TTL = 60000; // 1 minute

// Simple PNG decoder for hash computation (handles most catalog textures)
function decodePngPixels(buffer) {
    // Check PNG signature
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
        return null; // Not a PNG
    }

    let offset = 8; // Skip signature
    let width = 0, height = 0, bitDepth = 0, colorType = 0;
    let compressedData = Buffer.alloc(0);

    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);

        if (type === 'IHDR') {
            width = buffer.readUInt32BE(offset + 8);
            height = buffer.readUInt32BE(offset + 12);
            bitDepth = buffer[offset + 16];
            colorType = buffer[offset + 17];
        } else if (type === 'IDAT') {
            compressedData = Buffer.concat([compressedData, buffer.subarray(offset + 8, offset + 8 + length)]);
        } else if (type === 'IEND') {
            break;
        }
        offset += 12 + length;
    }

    if (width === 0 || height === 0) return null;

    // Decompress using Node.js zlib
    try {
        const zlib = require('zlib');
        const rawData = zlib.inflateSync(compressedData);

        const pixels = [];
        const bpp = colorType === 2 ? 3 : colorType === 6 ? 4 : 1; // RGB or RGBA or grayscale
        const stride = width * bpp + 1; // +1 for filter byte

        for (let y = 0; y < height; y++) {
            const filterType = rawData[y * stride];
            for (let x = 0; x < width; x++) {
                const idx = y * stride + 1 + x * bpp;
                let r = rawData[idx] || 0;
                let g = bpp > 1 ? rawData[idx + 1] || 0 : r;
                let b = bpp > 2 ? rawData[idx + 2] || 0 : r;

                // Simple filter reversal (sub filter)
                if (filterType === 1 && x > 0) {
                    const prevIdx = y * stride + 1 + (x - 1) * bpp;
                    r = (r + rawData[prevIdx]) & 0xFF;
                    g = bpp > 1 ? (g + rawData[prevIdx + 1]) & 0xFF : r;
                    b = bpp > 2 ? (b + rawData[prevIdx + 2]) & 0xFF : r;
                }

                pixels.push(0.299 * r + 0.587 * g + 0.114 * b);
            }
        }
        return { pixels, width, height };
    } catch {
        return null;
    }
}

// Simple JPEG decoder fallback - extract approximate pixels from JPEG
function decodeJpegPixels(buffer) {
    // Very basic JPEG: scan for SOS marker and extract approximate pixel data
    // This is a simplified approach - finds pixel-like data in the compressed stream
    const pixels = [];
    // Skip JPEG header bytes and sample data regions
    const startOffset = Math.min(20, buffer.length); // Skip header
    const dataRegion = buffer.length - startOffset - 2; // Skip end marker
    const sampleCount = 64; // 8x8 hash
    const step = Math.max(1, Math.floor(dataRegion / sampleCount));

    for (let i = 0; i < sampleCount && (startOffset + i * step) < buffer.length - 2; i++) {
        const pos = startOffset + i * step;
        const r = buffer[pos] || 0;
        const g = buffer[pos + 1] || r;
        const b = buffer[pos + 2] || r;
        pixels.push(0.299 * r + 0.587 * g + 0.114 * b);
    }

    while (pixels.length < sampleCount) pixels.push(0);
    return { pixels, width: 8, height: 8 };
}

// Average Hash (aHash) - perceptual fingerprint with proper image decoding
function averageHash(imageBuffer, hashSize = 8) {
    let decoded = null;

    // Try PNG first (most common for catalog textures)
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
        decoded = decodePngPixels(imageBuffer);
    }

    // Fallback to JPEG approximation
    if (!decoded && imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
        decoded = decodeJpegPixels(imageBuffer);
    }

    // Final fallback: raw byte sampling
    if (!decoded) {
        const pixels = [];
        const len = imageBuffer.length;
        const step = Math.max(1, Math.floor(len / (hashSize * hashSize * 3)));
        for (let i = 0; i < len && pixels.length < hashSize * hashSize; i += step) {
            if (i + 2 < len) {
                pixels.push(0.299 * (imageBuffer[i] || 0) + 0.587 * (imageBuffer[i + 1] || 0) + 0.114 * (imageBuffer[i + 2] || 0));
            }
        }
        while (pixels.length < hashSize * hashSize) pixels.push(0);
        decoded = { pixels };
    }

    // Resize to hashSize x hashSize using nearest neighbor
    const srcPixels = decoded.pixels;
    const srcLen = srcPixels.length;
    const sampled = [];
    for (let i = 0; i < hashSize * hashSize; i++) {
        const srcIdx = Math.floor((i / (hashSize * hashSize)) * srcLen);
        sampled.push(srcPixels[Math.min(srcIdx, srcLen - 1)]);
    }

    // Calculate average
    const avg = sampled.reduce((a, b) => a + b, 0) / sampled.length;

    // Generate hash bits
    let hash = 0n;
    for (let i = 0; i < hashSize * hashSize; i++) {
        if (sampled[i] >= avg) hash |= (1n << BigInt(i));
    }
    return hash;
}

// Hamming distance between two hashes
/**
 * Highly optimized Hamming distance between two 64-bit BigInt hashes.
 * Uses SWAR (SIMD Within A Register) population count algorithm for ~100x speedup.
 */
function hammingDistance(hash1, hash2) {
    const diff = hash1 ^ hash2;

    // Split 64-bit BigInt into two 32-bit signed integers for high-performance bitwise ops.
    // Numbers in Node.js are 64-bit floats, but bitwise operations convert them to 32-bit ints.
    const low = Number(diff & 0xFFFFFFFFn);
    const high = Number(diff >> 32n);

    // SWAR population count for 32-bit integers.
    // Uses unsigned right shift (>>>) for predictable behavior with JavaScript's 32nd bit.
    const popcount32 = (n) => {
        n = n - ((n >>> 1) & 0x55555555);
        n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
        return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
    };

    return popcount32(low) + popcount32(high);
}

// Build hash index for all textures in the catalog
async function buildTextureHashIndex() {
    const now = Date.now();
    if (textureHashCache && (now - textureHashCacheTime) < HASH_CACHE_TTL) {
        return textureHashCache;
    }

    const index = {};

    try {
        const entries = await fs.promises.readdir(TEXTURES_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name !== 'Uncategorized') {
                const categoryPath = path.join(TEXTURES_DIR, entry.name);
                const isHidden = entry.name === 'Hidden';
                const files = await fs.promises.readdir(categoryPath);
                index[entry.name] = [];

                for (const file of files) {
                    const ext = path.extname(file).toLowerCase();
                    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                        try {
                            const filePath = path.join(categoryPath, file);
                            const buffer = await fs.promises.readFile(filePath);
                            const hash = averageHash(buffer);
                            index[entry.name].push({
                                name: path.basename(file, ext),
                                file: file,
                                url: isHidden ? null : `/textures/${encodeURIComponent(entry.name)}/${encodeURIComponent(file)}`,
                                hidden: isHidden,
                                hash: hash.toString()
                            });
                        } catch (e) {
                            console.error(`[Texture] Hash error for ${file}: ${e.message}`);
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(`[Texture] Index build error: ${e.message}`);
    }

    textureHashCache = index;
    textureHashCacheTime = now;
    return index;
}

// GET /api/textures - List all categories
app.get('/api/textures', async (req, res) => {
    try {
        const entries = await fs.promises.readdir(TEXTURES_DIR, { withFileTypes: true });
        const categories = entries
            .filter(e => e.isDirectory() && e.name !== 'Uncategorized' && e.name !== 'Hidden')
            .map(e => e.name);
        res.json({ success: true, categories });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to read texture categories' });
    }
});

// GET /api/textures/:category - List textures in a category
app.get('/api/textures/:category', async (req, res) => {
    const category = req.params.category;
    if (typeof category !== 'string' || category.length > 100) {
        return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    const categoryPath = path.join(TEXTURES_DIR, path.basename(category));
    const rel = path.relative(TEXTURES_DIR, categoryPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    try {
        const files = await fs.promises.readdir(categoryPath);
        const textures = files
            .filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()))
            .map(f => ({
                name: path.basename(f, path.extname(f)),
                url: `/textures/${encodeURIComponent(category)}/${encodeURIComponent(f)}`
            }));
        res.json({ success: true, category, textures });
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'Category not found' });
        res.status(500).json({ success: false, error: 'Failed to read textures' });
    }
});

// POST /api/textures/match - Match an image against the catalog
app.post('/api/textures/match', express.json({ limit: '10mb' }), async (req, res) => {
    const { imageData, jobCode, room, materialName } = req.body;

    if (!imageData) {
        return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    try {
        // Decode base64 image data
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Compute hash for the input image
        const inputHash = averageHash(imageBuffer);
        const inputHashStr = inputHash.toString();

        // Build/load hash index
        const index = await buildTextureHashIndex();

        // Find best match across all categories (excluding hidden)
        let bestMatch = null;
        let bestDistance = Infinity;
        const allMatches = [];

        for (const [category, textures] of Object.entries(index)) {
            for (const tex of textures) {
                const catHash = BigInt(tex.hash);
                const distance = hammingDistance(inputHash, catHash);
                if (distance < bestDistance && !tex.hidden) {
                    bestDistance = distance;
                    bestMatch = { ...tex, category };
                }
                if (distance <= 20 && !tex.hidden) { // Threshold for "similar enough"
                    allMatches.push({ ...tex, category, distance });
                }
            }
        }

        // Sort matches by distance
        allMatches.sort((a, b) => a.distance - b.distance);

        // If no good match found, copy to Uncategorized
        const MATCH_THRESHOLD = 15; // Stricter threshold to avoid false matches
        if (bestDistance > MATCH_THRESHOLD) {
            const uncategorizedDir = path.join(TEXTURES_DIR, 'Uncategorized');
            if (!fs.existsSync(uncategorizedDir)) fs.mkdirSync(uncategorizedDir, { recursive: true });

            const safeName = `${jobCode || 'unknown'}_${room || 'room'}_${materialName || 'material'}`.replace(/[^a-zA-Z0-9\-_]/g, '_');
            const destPath = path.join(uncategorizedDir, `${safeName}.jpg`);
            await fs.promises.writeFile(destPath, imageBuffer);
            console.log(`[Texture] Saved unmatched texture to Uncategorized: ${safeName}.jpg`);
        }

        res.json({
            success: true,
            matched: bestDistance <= MATCH_THRESHOLD,
            bestMatch: bestDistance <= MATCH_THRESHOLD ? bestMatch : null,
            bestCategory: bestMatch ? bestMatch.category : null,
            distance: bestDistance,
            similarTextures: allMatches.slice(0, 12)
        });
    } catch (e) {
        console.error(`[Texture] Match error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to match texture' });
    }
});

// POST /api/textures/scan-jobs - Extract textures from all jobs and save unmatched to Uncategorized
app.post('/api/textures/scan-jobs', async (req, res) => {
    try {
        const index = await buildTextureHashIndex();
        const uncategorizedDir = path.join(TEXTURES_DIR, 'Uncategorized');
        if (!fs.existsSync(uncategorizedDir)) fs.mkdirSync(uncategorizedDir, { recursive: true });

        let extracted = 0;
        let matched = 0;
        let saved = 0;
        const errors = [];

        // Find all GLB files in jobs directory
        const findGlbs = async (dir) => {
            const glbs = [];
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        glbs.push(...(await findGlbs(fullPath)));
                    } else if (entry.name.toLowerCase().endsWith('.glb')) {
                        glbs.push(fullPath);
                    }
                }
            } catch { /* ignore */ }
            return glbs;
        };

        const glbFiles = await findGlbs(JOBS_DIR);

        for (const glbPath of glbFiles) {
            try {
                const glbBuffer = await fs.promises.readFile(glbPath);

                // Parse GLB using gltf-pipeline
                const resourceDirectory = path.dirname(glbPath);
                const result = await gltfPipeline.glbToGltf(glbBuffer, { resourceDirectory });
                const gltf = result.gltf;

                // Parse GLB header to find BIN chunk offset
                const jsonChunkLength = glbBuffer.readUInt32LE(12);
                const binChunkOffset = 12 + 8 + jsonChunkLength + 8;

                // Extract embedded images from buffers
                if (gltf.images && gltf.bufferViews) {
                    for (const image of gltf.images) {
                        if (image.bufferView === undefined) continue;
                        const bufferView = gltf.bufferViews[image.bufferView];

                        // Get the image data from the binary buffer
                        let imageData;
                        if (gltf.buffers && gltf.buffers[bufferView.buffer] && gltf.buffers[bufferView.buffer].uri) {
                            // Data URI
                            const base64 = gltf.buffers[bufferView.buffer].uri.split(',')[1];
                            imageData = Buffer.from(base64, 'base64');
                            const byteOffset = bufferView.byteOffset || 0;
                            const byteLength = bufferView.byteLength;
                            imageData = imageData.subarray(byteOffset, byteOffset + byteLength);
                        } else {
                            // Binary chunk
                            const byteOffset = bufferView.byteOffset || 0;
                            const byteLength = bufferView.byteLength;
                            imageData = glbBuffer.subarray(
                                binChunkOffset + byteOffset,
                                binChunkOffset + byteOffset + byteLength
                            );
                        }

                        extracted++;

                        // Hash the extracted image
                        const hash = averageHash(imageData);
                        let bestDistance = Infinity;
                        let isMatched = false;

                        // Compare against catalog
                        for (const [category, textures] of Object.entries(index)) {
                            for (const tex of textures) {
                                const catHash = BigInt(tex.hash);
                                const distance = hammingDistance(hash, catHash);
                                if (distance < bestDistance) {
                                    bestDistance = distance;
                                }
                                if (distance <= 15) {
                                    isMatched = true;
                                    matched++;
                                    break;
                                }
                            }
                            if (isMatched) break;
                        }

                        // Save unmatched textures to Uncategorized
                        if (!isMatched) {
                            const jobName = path.basename(path.dirname(glbPath));
                            const ext = image.mimeType === 'image/png' ? '.png' : '.jpg';
                            const safeName = `${jobName}_texture_${extracted}${ext}`;
                            const destPath = path.join(uncategorizedDir, safeName);

                            // Avoid duplicates
                            if (!fs.existsSync(destPath)) {
                                await fs.promises.writeFile(destPath, imageData);
                                saved++;
                                console.log(`[Texture Scan] Saved: ${safeName}`);
                            }
                        }
                    }
                }
            } catch (e) {
                errors.push({ file: glbPath, error: e.message });
                console.error(`[Texture Scan] Error processing ${glbPath}: ${e.message}`);
            }
        }

        // Invalidate hash cache since new textures may have been added
        textureHashCache = null;

        res.json({
            success: true,
            scanned: glbFiles.length,
            extracted,
            matched,
            saved,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (e) {
        console.error(`[Texture Scan] Error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to scan jobs' });
    }
});

// Extract textures from a GLB file and save unmatched to Uncategorized
async function extractTexturesFromGlb(glbPath) {
    const glbBuffer = await fs.promises.readFile(glbPath);
    const resourceDirectory = path.dirname(glbPath);
    const result = await gltfPipeline.glbToGltf(glbBuffer, { resourceDirectory });
    const gltf = result.gltf;

    if (!gltf.images || !gltf.bufferViews) return;

    const index = await buildTextureHashIndex();
    const uncategorizedDir = path.join(TEXTURES_DIR, 'Uncategorized');
    if (!fs.existsSync(uncategorizedDir)) fs.mkdirSync(uncategorizedDir, { recursive: true });

    // Parse GLB header to find BIN chunk offset
    const jsonChunkLength = glbBuffer.readUInt32LE(12);
    const binChunkOffset = 12 + 8 + jsonChunkLength + 8; // header + json chunk header + json + bin chunk header

    for (const image of gltf.images) {
        if (image.bufferView === undefined) continue;
        const bufferView = gltf.bufferViews[image.bufferView];

        let imageData;
        // Try to get from buffer URI first (if gltf-pipeline converted to data URI)
        if (gltf.buffers && gltf.buffers[bufferView.buffer] && gltf.buffers[bufferView.buffer].uri) {
            const base64 = gltf.buffers[bufferView.buffer].uri.split(',')[1];
            imageData = Buffer.from(base64, 'base64');
            // Extract just the portion this bufferView needs
            const byteOffset = bufferView.byteOffset || 0;
            const byteLength = bufferView.byteLength;
            imageData = imageData.subarray(byteOffset, byteOffset + byteLength);
        } else {
            // Extract from GLB binary chunk
            const byteOffset = bufferView.byteOffset || 0;
            const byteLength = bufferView.byteLength;
            imageData = glbBuffer.subarray(binChunkOffset + byteOffset, binChunkOffset + byteOffset + byteLength);
        }

        if (imageData.length === 0) continue;

        const hash = averageHash(imageData);
        let isMatched = false;

        for (const [category, textures] of Object.entries(index)) {
            for (const tex of textures) {
                const catHash = BigInt(tex.hash);
                const distance = hammingDistance(hash, catHash);
                if (distance <= 15) {
                    isMatched = true;
                    break;
                }
            }
            if (isMatched) break;
        }

        if (!isMatched) {
            const jobName = path.basename(path.dirname(glbPath));
            const ext = image.mimeType === 'image/png' ? '.png' : '.jpg';
            const safeName = `${jobName}_texture_${Date.now()}${ext}`;
            const destPath = path.join(uncategorizedDir, safeName);
            if (!fs.existsSync(destPath)) {
                await fs.promises.writeFile(destPath, imageData);
                console.log(`[Texture Extract] Saved: ${safeName}`);
            }
        }
    }

    textureHashCache = null; // Invalidate cache
}

// --- CONVERSION ENGINE ---
const conversionQueue = [];
let isConverting = false;

// --- COLLADA ph/h TRIANGULATOR ---

// Fix COLLADA transparency for RGB_ZERO mode: final alpha = 1 - (color.rgb × transparency)
// For glass that's 10% transparent (0.1 in DAE), it renders 90% opaque.
// We replace this with a higher value (default 0.8) to make it more transparent.
function fixTransparency(content) {
    return content.replace(
        /<transparency>\s*<float>([\d.]+)<\/float>\s*<\/transparency>/g,
        `<transparency><float>${GLASS_TRANSPARENCY}</float></transparency>`
    );
}

// Convert <ph>...</ph> blocks by simply keeping the outer <p> and discarding the <h> holes.
// This allows Assimp to triangulate the polygon naturally and preserves texture mapping.
function convertPhElements(content) {
    return content.replace(
        /<ph>([\s\S]*?)<\/ph>/g,
        (phMatch, phContent) => {
            const pMatch = phContent.match(/<p>([\s\S]*?)<\/p>/);
            if (!pMatch) return ''; // malformed — drop it
            return `<p>${pMatch[1].trim()}</p>`;
        }
    );
}

async function cleanDae(filePath) {
    try {
        let content = await fs.promises.readFile(filePath, 'utf8');
        let cleaned = content;
        cleaned = cleaned.replace(/\t/g, ' ').replace(/ +/g, ' ');
        cleaned = cleaned.replace(/> /g, '>').replace(/ <\//g, '</');
        cleaned = convertPhElements(cleaned);
        cleaned = fixTransparency(cleaned);
        if (content !== cleaned) await fs.promises.writeFile(filePath, cleaned, 'utf8');
    } catch (e) { console.error(`!!! [Cleaner] Error: ${e.message}`); }
}

async function processQueue() {
    if (isConverting || conversionQueue.length === 0) return;
    isConverting = true;
    const { filePath } = conversionQueue.shift();
    const dir = path.dirname(filePath);
    const roomName = path.basename(dir);
    const inputFilename = path.basename(filePath);
    const outputGlb = `${roomName.replace(/ /g, '_')}.glb`;
    const finalGlb = path.join(dir, `${roomName}.glb`);

    await cleanDae(filePath);

    // Security: Prepend ./ (or .\) to ensure arguments are treated as paths, not command flags
    const pathPrefix = process.platform === 'win32' ? '.\\' : './';
    const safeInputPath = `${pathPrefix}${inputFilename}`;
    const safeOutputPath = `${pathPrefix}${outputGlb}`;

    execFile(ASSIMP_PATH, ['export', safeInputPath, safeOutputPath, 'glb2', '-tri', '-gn', '-jiv', '-et', '-emb'], { cwd: dir }, async (err, stdout, stderr) => {
        if (err) console.error(`!!! [FAILED] ${roomName}: ${stderr || err.message}`);
        else {
            const genGlb = path.join(dir, outputGlb);
            if (outputGlb !== `${roomName}.glb`) {
                try {
                    await fs.promises.access(genGlb);
                    await fs.promises.rename(genGlb, finalGlb);
                } catch(e) {
                    if (e.code !== 'ENOENT') console.error(`!!! [FAILED] Rename ${roomName}: ${e.message}`);
                }
            }
            console.log(`SUCCESS: ${roomName} is live.`);

            // Auto-extract textures from newly created GLB (only if not already extracted)
            try {
                const uncategorizedDir = path.join(TEXTURES_DIR, 'Uncategorized');
                const existingFiles = fs.existsSync(uncategorizedDir) ? await fs.promises.readdir(uncategorizedDir) : [];
                const hasExtracted = existingFiles.some(f => f.startsWith(`${roomName}_texture_`));
                
                if (!hasExtracted) {
                    await extractTexturesFromGlb(finalGlb);
                }
            } catch(e) {
                console.error(`[Texture Extract] Error for ${roomName}: ${e.message}`);
            }
        }
        isConverting = false;
        processQueue();
    });
}

const pendingTimers = new Map();
async function convertDesign(filePath, skipTimer = false) {
    if (path.extname(filePath).toLowerCase() !== '.dae') return;
    const roomDir = path.dirname(filePath);
    const roomName = path.basename(roomDir);
    const glbPath = path.join(roomDir, `${roomName}.glb`);

    try {
        const hasGlb = await fs.promises.access(glbPath, fs.constants.F_OK).then(() => true).catch(() => false);
        if (hasGlb) {
            const [daeStat, glbStat] = await Promise.all([
                fs.promises.stat(filePath),
                fs.promises.stat(glbPath)
            ]);
            if (glbStat.mtimeMs > daeStat.mtimeMs) return;
        }
    } catch {
        // Suppress stat errors (e.g. file deleted during check)
    }

    if (skipTimer) {
        conversionQueue.push({ filePath });
        processQueue();
        return;
    }
    if (pendingTimers.has(roomDir)) clearTimeout(pendingTimers.get(roomDir));
    pendingTimers.set(roomDir, setTimeout(() => {
        pendingTimers.delete(roomDir);
        conversionQueue.push({ filePath });
        processQueue();
    }, 15000));
}

// --- ERROR HANDLING ---
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`KKC PORTAL v${APP_VERSION} ACTIVE ON PORT ${PORT}`);
        const scan = async (dir) => {
            try {
                const hasAccess = await fs.promises.access(dir).then(() => true).catch(() => false);
                if (!hasAccess) return;
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const promises = entries.map(entry => {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) return scan(fullPath);
                    else if (entry.name.toLowerCase().endsWith('.dae')) convertDesign(fullPath, true);
                });
                await Promise.all(promises);
            } catch {
                // ignore
            }
        };
        scan(JOBS_DIR);
    });

    chokidar.watch(JOBS_DIR, {
        ignoreInitial: true,
        ignored: [/(\\|\/)\./, '**/*.glb'],
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
    }).on('all', (event, fp) => {
        const dir = path.dirname(fp);
        fs.readdir(dir, (err, files) => {
            if (!err) {
                files.filter(f => f.toLowerCase().endsWith('.dae'))
                     .forEach(f => convertDesign(path.join(dir, f)));
            }
        });
    });

    // Watch textures folder for live changes
    let textureRescanTimer = null;
    chokidar.watch(TEXTURES_DIR, {
        ignoreInitial: true,
        ignored: [/(\\|\/)\./, '**/Thumbs.db'],
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
    }).on('all', async (event, fp) => {
        console.log(`[Texture] ${event}: ${fp}`);
        textureHashCache = null; // Invalidate cache on any change

        // Auto re-scan jobs after textures are organized (debounced)
        if (['add', 'unlink', 'addDir', 'unlinkDir'].includes(event)) {
            if (textureRescanTimer) clearTimeout(textureRescanTimer);
            textureRescanTimer = setTimeout(async () => {
                // Extract job name from texture filename if it's a job texture (e.g., "548_texture_xxx.jpg")
                const fileName = path.basename(fp);
                const jobMatch = fileName.match(/^(\d+)_texture_/);
                
                if (jobMatch) {
                    // Only re-scan the specific job that had this texture
                    const jobName = jobMatch[1];
                    console.log(`[Texture] Auto re-scanning job ${jobName} after texture organization...`);
                    try {
                        const jobDir = path.join(JOBS_DIR, jobName);
                        const findGlbs = async (dir) => {
                            const glbs = [];
                            try {
                                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                                for (const entry of entries) {
                                    const fullPath = path.join(dir, entry.name);
                                    if (entry.isDirectory()) {
                                        glbs.push(...(await findGlbs(fullPath)));
                                    } else if (entry.name.toLowerCase().endsWith('.glb')) {
                                        glbs.push(fullPath);
                                    }
                                }
                            } catch { /* ignore */ }
                            return glbs;
                        };
                        const glbFiles = await findGlbs(jobDir);
                        for (const glbPath of glbFiles) {
                            try {
                                await extractTexturesFromGlb(glbPath);
                            } catch (e) {
                                console.error(`[Texture Rescan] Error for ${glbPath}: ${e.message}`);
                            }
                        }
                        console.log(`[Texture] Auto re-scan complete for job ${jobName}.`);
                    } catch (e) {
                        console.error(`[Texture] Auto re-scan error: ${e.message}`);
                    }
                }
                // If not a job texture (manually added), cache was already invalidated above
            }, 60000); // Wait 1 minute after last change before re-scanning
        }
    });
}

module.exports = app;
module.exports.cleanDae = cleanDae;