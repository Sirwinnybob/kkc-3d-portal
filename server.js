
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
const sharp = require('sharp');

const app = express();
const APP_VERSION = "2.0.0";

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
app.use('/textures', express.static(TEXTURES_DIR, {
    etag: true,
    lastModified: true,
    maxAge: 0,
    cacheControl: true
}));

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

// GET /api/job/:code/:room/textures - Serve pre-computed texture manifest
app.get('/api/job/:code/:room/textures', async (req, res) => {
    const { code, room } = req.params;

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

    const relCode = path.relative(safeBase, jobPath);
    const relRoom = path.relative(jobPath, roomPath);
    if (!relCode || relCode.startsWith('..') || path.isAbsolute(relCode) || !relRoom || relRoom.startsWith('..') || path.isAbsolute(relRoom)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Find the textures.json manifest alongside the GLB
    const findManifest = async (dir) => {
        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            const dirs = [];
            for (const dirent of entries) {
                if (dirent.isDirectory()) {
                    dirs.push(path.join(dir, dirent.name));
                } else if (dirent.name.toLowerCase() === `${safeRoom.toLowerCase()}.textures.json`) {
                    return path.join(dir, dirent.name);
                }
            }
            for (const d of dirs) {
                const result = await findManifest(d);
                if (result) return result;
            }
        } catch { /* ignore */ }
        return null;
    };

    const manifestPath = await findManifest(jobPath);
    if (!manifestPath) {
        return res.status(404).json({ success: false, error: 'No texture manifest found' });
    }

    try {
        const content = await fs.promises.readFile(manifestPath, 'utf8');
        res.json(JSON.parse(content));
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to read manifest' });
    }
});

// --- TEXTURE CATALOG API ---

// Perceptual hash cache
let textureHashCache = null;
let textureHashCacheTime = 0;
const HASH_CACHE_TTL = 60000; // 1 minute

/**
 * Perceptual Hash (pHash) using Discrete Cosine Transform (DCT)
 * Implementation matches logic common in imagehash libraries (32x32 -> 8x8)
 * Using 'sharp' for robust image decoding and normalization.
 */
async function computePhash(imageBuffer) {
    try {
        // Resize to 32x32, grayscale, and normalize (auto-level) to handle 'washed out' images
        const { data, info } = await sharp(imageBuffer)
            .resize(32, 32, { fit: 'fill' })
            .grayscale()
            .normalize()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixels = new Float64Array(32 * 32);
        for (let i = 0; i < 32 * 32; i++) pixels[i] = data[i];

        // 2D Discrete Cosine Transform (DCT)
        const dct = performDCT(pixels, 32);

        // Extract the top-left 8x8 coefficients (excluding DC at [0,0])
        const subMatrix = [];
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (x === 0 && y === 0) continue;
                subMatrix.push(dct[y * 32 + x]);
            }
        }

        // Calculate median of coefficients
        const sorted = [...subMatrix].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        // Generate 64-bit BigInt hash
        let hash = 0n;
        for (let i = 0; i < subMatrix.length; i++) {
            if (subMatrix[i] > median) {
                hash |= (1n << BigInt(i));
            }
        }
        return hash;
    } catch (e) {
        console.error(`[pHash] Computation error: ${e.message}`);
        return 0n;
    }
}

/**
 * 2D Discrete Cosine Transform (DCT-II)
 * Optimized for small N (e.g., 32)
 */
function performDCT(pixels, N) {
    const dct = new Float64Array(N * N);
    const c = new Float64Array(N);
    for (let i = 1; i < N; i++) c[i] = Math.sqrt(2.0 / N);
    c[0] = Math.sqrt(1.0 / N);

    for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
            let sum = 0;
            for (let x = 0; x < N; x++) {
                for (let y = 0; y < N; y++) {
                    sum += pixels[x * N + y] *
                           Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) *
                           Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
                }
            }
            dct[u * N + v] = c[u] * c[v] * sum;
        }
    }
    return dct;
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
                const items = await fs.promises.readdir(categoryPath, { withFileTypes: true });
                index[entry.name] = [];

                // 1. Process main textures first
                for (const item of items) {
                    if (item.isDirectory()) continue;
                    const file = item.name;
                    if (file === 'Thumbs.db' || file.startsWith('.')) continue;
                    const ext = path.extname(file).toLowerCase();
                    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                        try {
                            const filePath = path.join(categoryPath, file);
                            const buffer = await fs.promises.readFile(filePath);
                            const hash = await computePhash(buffer);
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

                // 2. Process variant hashes in the 'hashes/' sub-folder
                const hashFolderPath = path.join(categoryPath, 'hashes');
                if (fs.existsSync(hashFolderPath)) {
                    const variantFiles = await fs.promises.readdir(hashFolderPath);
                    for (const file of variantFiles) {
                        if (file === 'Thumbs.db' || file.startsWith('.')) continue;
                        const ext = path.extname(file).toLowerCase();
                        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                            try {
                                const filePath = path.join(hashFolderPath, file);
                                const buffer = await fs.promises.readFile(filePath);
                                const hash = await computePhash(buffer);

                                // Identify canonical texture by stripping "_N" suffix (e.g., "Wild Cherry_1.jpg" -> "Wild Cherry")
                                let canonicalName = path.basename(file, ext).replace(/_\d+$/, '');

                                // Find the canonical entry in the index (must match name exactly)
                                const canonical = index[entry.name].find(t => t.name === canonicalName);

                                if (canonical) {
                                    index[entry.name].push({
                                        name: canonical.name, // Return canonical name
                                        file: canonical.file, // Return canonical file
                                        url: canonical.url,   // Return canonical URL
                                        hidden: canonical.hidden,
                                        hash: hash.toString(),
                                        isVariant: true,
                                        variantFile: file
                                    });
                                } else {
                                    console.warn(`[Texture] Variant ${file} found but no canonical texture '${canonicalName}' exists in ${entry.name}.`);
                                }
                            } catch (e) {
                                console.error(`[Texture] Variant hash error for ${file}: ${e.message}`);
                            }
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
    let { imageData, jobCode, room, materialName } = req.body;

    // Security: Strict input validation for metadata
    if (jobCode && (typeof jobCode !== 'string' || jobCode.length > 50)) jobCode = jobCode.toString().slice(0, 50);
    if (room && (typeof room !== 'string' || room.length > 50)) room = room.toString().slice(0, 50);
    if (materialName && (typeof materialName !== 'string' || materialName.length > 50)) materialName = materialName.toString().slice(0, 50);

    if (!imageData) {
        return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    try {
        // Decode base64 image data
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Compute hash for the input image
        const inputHash = await computePhash(imageBuffer);
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

                // Track absolute best match including hidden ones
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = { ...tex, category };
                }

                // Track similar non-hidden matches for the catalog view
                if (distance <= 20 && !tex.hidden) {
                    allMatches.push({ ...tex, category, distance });
                }
            }
        }

        // Sort matches by distance
        allMatches.sort((a, b) => a.distance - b.distance);

        // If no good match found, copy to Uncategorized
        const MATCH_THRESHOLD = 15; // Stricter threshold to avoid false matches
        const isMatched = bestDistance <= MATCH_THRESHOLD;

        if (!isMatched) {
            const uncategorizedDir = path.join(TEXTURES_DIR, 'Uncategorized');
            if (!fs.existsSync(uncategorizedDir)) fs.mkdirSync(uncategorizedDir, { recursive: true });

            const safeName = `${jobCode || 'unknown'}_${room || 'room'}_${materialName || 'material'}`.replace(/[^a-zA-Z0-9\-_]/g, '_');
            const destPath = path.join(uncategorizedDir, `${safeName}.jpg`);
            await fs.promises.writeFile(destPath, imageBuffer);
            console.log(`[Texture] Saved unmatched texture to Uncategorized: ${safeName}.jpg`);
        }

        res.json({
            success: true,
            matched: !!isMatched,
            bestMatch: isMatched ? bestMatch : null,
            bestCategory: (isMatched && bestMatch) ? bestMatch.category : null,
            isHidden: isMatched && bestMatch && bestMatch.hidden,
            distance: bestDistance,
            similarTextures: allMatches.slice(0, 12)
        });
    } catch (e) {
        console.error(`[Texture] Match error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to match texture' });
    }
});

// POST /api/textures/scan-jobs - Extract textures from DAE images folders and save to Uncategorized
app.post('/api/textures/scan-jobs', async (req, res) => {
    try {
        const uncategorizedDir = path.join(TEXTURES_DIR, 'Uncategorized');
        if (!fs.existsSync(uncategorizedDir)) fs.mkdirSync(uncategorizedDir, { recursive: true });

        let extracted = 0;
        const errors = [];

        // Find all DAE files in jobs directory
        const findDaes = async (dir) => {
            const daes = [];
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        daes.push(...(await findDaes(fullPath)));
                    } else if (entry.name.toLowerCase().endsWith('.dae')) {
                        daes.push(fullPath);
                    }
                }
            } catch { /* ignore */ }
            return daes;
        };

        const daeFiles = await findDaes(JOBS_DIR);

        for (const daePath of daeFiles) {
            try {
                const imagesDir = path.join(path.dirname(daePath), 'images');

                // Check if images folder exists
                try {
                    await fs.promises.access(imagesDir);
                } catch {
                    continue; // No images folder, skip
                }

                const files = await fs.promises.readdir(imagesDir);
                for (const file of files) {
                    // Skip Thumbs.db and system files
                    if (file === 'Thumbs.db' || file.startsWith('.')) continue;
                    const ext = path.extname(file).toLowerCase();
                    if (['.jpg', '.jpeg', '.png', '.webp', '.tga', '.bmp'].includes(ext)) {
                        const srcPath = path.join(imagesDir, file);
                        const destPath = path.join(uncategorizedDir, file);

                        // Avoid duplicates
                        if (!fs.existsSync(destPath)) {
                            await fs.promises.copyFile(srcPath, destPath);
                            extracted++;
                            console.log(`[Texture Scan] Extracted: ${file}`);
                        }
                    }
                }
            } catch (e) {
                errors.push({ file: daePath, error: e.message });
                console.error(`[Texture Scan] Error processing ${daePath}: ${e.message}`);
            }
        }

        // Invalidate hash cache since new textures may have been added
        textureHashCache = null;

        res.json({
            success: true,
            scanned: daeFiles.length,
            extracted,
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

        const hash = await computePhash(imageData);
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

// Extract textures from a DAE file's images folder (pre-GLB conversion)
async function extractTexturesFromDaeImages(daeFilePath) {
    const dir = path.dirname(daeFilePath);
    const imagesDir = path.join(dir, 'images');

    // Check if images folder exists
    try {
        await fs.promises.access(imagesDir);
    } catch {
        return; // No images folder, nothing to extract
    }

    const uncategorizedDir = path.join(TEXTURES_DIR, 'Uncategorized');
    if (!fs.existsSync(uncategorizedDir)) fs.mkdirSync(uncategorizedDir, { recursive: true });

    const index = await buildTextureHashIndex();
    const files = await fs.promises.readdir(imagesDir);
    let extracted = 0;

    for (const file of files) {
        // Skip Thumbs.db and system files
        if (file === 'Thumbs.db' || file.startsWith('.')) continue;
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.tga', '.bmp'].includes(ext)) {
            const srcPath = path.join(imagesDir, file);
            const destPath = path.join(uncategorizedDir, file);

            // Avoid duplicates
            if (fs.existsSync(destPath)) continue;

            try {
                const buffer = await fs.promises.readFile(srcPath);
                const hash = await computePhash(buffer);
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
                    await fs.promises.writeFile(destPath, buffer);
                    extracted++;
                    console.log(`[DAE Texture] Extracted (unmatched): ${file}`);
                } else {
                    console.log(`[DAE Texture] Skipped (matched in library): ${file}`);
                }
            } catch (e) {
                console.error(`[DAE Texture] Error processing ${file}: ${e.message}`);
            }
        }
    }

    if (extracted > 0) {
        textureHashCache = null; // Invalidate cache since new textures were added
        console.log(`[DAE Texture] Extracted ${extracted} texture(s) from ${path.basename(daeFilePath)}`);
    }
}

// Generate a texture manifest (sidecar JSON) for a GLB file
// This pre-matches all embedded textures server-side so the client doesn't have to
async function generateTextureManifest(glbPath) {
    try {
        const glbBuffer = await fs.promises.readFile(glbPath);
        const resourceDirectory = path.dirname(glbPath);
        const result = await gltfPipeline.glbToGltf(glbBuffer, { resourceDirectory });
        const gltf = result.gltf;

        if (!gltf.images || !gltf.bufferViews) return;

        const index = await buildTextureHashIndex();
        const manifest = { materials: {} };

        // Parse GLB header to find BIN chunk offset
        const jsonChunkLength = glbBuffer.readUInt32LE(12);
        const binChunkOffset = 12 + 8 + jsonChunkLength + 8;

        for (let i = 0; i < gltf.images.length; i++) {
            try {
                const image = gltf.images[i];
                if (image.bufferView === undefined) continue;
                const bufferView = gltf.bufferViews[image.bufferView];

                let imageData;
                if (gltf.buffers && gltf.buffers[bufferView.buffer] && gltf.buffers[bufferView.buffer].uri) {
                    const base64 = gltf.buffers[bufferView.buffer].uri.split(',')[1];
                    imageData = Buffer.from(base64, 'base64');
                    const byteOffset = bufferView.byteOffset || 0;
                    const byteLength = bufferView.byteLength;
                    imageData = imageData.subarray(byteOffset, byteOffset + byteLength);
                } else {
                    const byteOffset = bufferView.byteOffset || 0;
                    const byteLength = bufferView.byteLength;
                    imageData = glbBuffer.subarray(binChunkOffset + byteOffset, binChunkOffset + byteOffset + byteLength);
                }

                if (imageData.length === 0) continue;

                const inputHash = await computePhash(imageData);
            let bestMatch = null;
            let bestDistance = Infinity;
            const allMatches = [];

            for (const [category, textures] of Object.entries(index)) {
                for (const tex of textures) {
                    const catHash = BigInt(tex.hash);
                    const distance = hammingDistance(inputHash, catHash);

                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestMatch = { ...tex, category };
                    }

                    if (distance <= 20 && !tex.hidden) {
                        allMatches.push({ ...tex, category, distance });
                    }
                }
            }

                allMatches.sort((a, b) => a.distance - b.distance);
                const isMatched = bestDistance <= 15;

                // Use image index as key (matches client-side texture ordering)
                manifest.materials[i] = {
                    matched: isMatched,
                    bestMatch: isMatched ? { name: bestMatch.name, url: bestMatch.url, category: bestMatch.category } : null,
                    bestCategory: (isMatched && bestMatch) ? bestMatch.category : null,
                    isHidden: isMatched && bestMatch && !!bestMatch.hidden,
                    distance: bestDistance,
                    similarTextures: allMatches.slice(0, 12).map(t => ({ name: t.name, url: t.url, category: t.category, distance: t.distance }))
                };
            } catch (e) {
                console.error(`[Texture Manifest] Error processing image ${i}: ${e.message}`);
            }
        }

        // Write sidecar JSON
        const manifestPath = glbPath.replace(/\.glb$/i, '.textures.json');
        await fs.promises.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
        console.log(`[Texture Manifest] Generated: ${path.basename(manifestPath)}`);
    } catch (e) {
        console.error(`[Texture Manifest] Error: ${e.message}`);
    }
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

    // Extract textures from DAE images folder before GLB conversion
    await extractTexturesFromDaeImages(filePath);
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
            // Generate texture manifest for client-side consumption
            await generateTextureManifest(finalGlb);
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

        // Generate texture manifests for existing GLBs that don't have one
        const generateMissingManifests = async (dir) => {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await generateMissingManifests(fullPath);
                    } else if (entry.name.toLowerCase().endsWith('.glb')) {
                        const manifestPath = fullPath.replace(/\.glb$/i, '.textures.json');
                        const hasManifest = await fs.promises.access(manifestPath).then(() => true).catch(() => false);
                        if (!hasManifest) {
                            await generateTextureManifest(fullPath);
                        }
                    }
                }
            } catch { /* ignore */ }
        };
        // Run after a short delay so DAE conversions start first
        setTimeout(() => generateMissingManifests(JOBS_DIR), 5000);
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
                        const findDaes = async (dir) => {
                            const daes = [];
                            try {
                                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                                for (const entry of entries) {
                                    const fullPath = path.join(dir, entry.name);
                                    if (entry.isDirectory()) {
                                        daes.push(...(await findDaes(fullPath)));
                                    } else if (entry.name.toLowerCase().endsWith('.dae')) {
                                        daes.push(fullPath);
                                    }
                                }
                            } catch { /* ignore */ }
                            return daes;
                        };
                        const daeFiles = await findDaes(jobDir);
                        for (const daePath of daeFiles) {
                            try {
                                await extractTexturesFromDaeImages(daePath);
                            } catch (e) {
                                console.error(`[Texture Rescan] Error for ${daePath}: ${e.message}`);
                            }
                        }
                        console.log(`[Texture] Auto re-scan complete for job ${jobName}.`);
                    } catch (e) {
                        console.error(`[Texture] Auto re-scan error: ${e.message}`);
                    }
                }
                // If not a job texture (manually added to the library), regenerate all manifests
                if (!jobMatch) {
                    console.log('[Texture] Library changed — regenerating all texture manifests...');
                    const regenerateManifests = async (dir) => {
                        try {
                            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                            for (const entry of entries) {
                                const fullPath = path.join(dir, entry.name);
                                if (entry.isDirectory()) {
                                    await regenerateManifests(fullPath);
                                } else if (entry.name.toLowerCase().endsWith('.glb')) {
                                    await generateTextureManifest(fullPath);
                                }
                            }
                        } catch { /* ignore */ }
                    };
                    await regenerateManifests(JOBS_DIR);
                    console.log('[Texture] All manifests regenerated.');
                }
            }, 60000); // Wait 1 minute after last change before re-scanning
        }
    });
}

module.exports = app;
module.exports.cleanDae = cleanDae;
module.exports.extractTexturesFromDaeImages = extractTexturesFromDaeImages;