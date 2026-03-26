
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
const { popcount32, hammingDistance } = require('./utils/hash');
const gltfPipeline = require('gltf-pipeline');
const sharp = require('sharp');

const app = express();
const APP_VERSION = "2.1.4";

// --- CONFIG ---
const PORT = parseInt(process.env.PORT) || 5021;
const JOBS_DIR = process.env.JOBS_DIR ? path.resolve(process.env.JOBS_DIR) : path.join(__dirname, 'jobs');
const TEXTURES_DIR = process.env.TEXTURES_DIR ? path.resolve(process.env.TEXTURES_DIR) : path.join(path.dirname(JOBS_DIR), 'textures');
const ASSIMP_PATH = process.platform === 'win32' ? 'assimp.exe' : 'assimp';
const GLASS_TRANSPARENCY = parseFloat(process.env.GLASS_TRANSPARENCY) || 0.8;
const SHOWROOM_DIR = process.env.SHOWROOM_DIR ? path.resolve(process.env.SHOWROOM_DIR) : path.join(path.dirname(JOBS_DIR), 'Showroom');
const SHOWROOM_CONTEXTS = ['kitchen', 'island'];
const SHOWROOM_STYLES = ['face_frame', 'full_inset', 'frameless'];
const SHOWROOM_OVERLAYS = ['full_overlay', 'half_overlay'];
// Categories that live UNDER an overlay folder (only face_frame has overlays)
const OVERLAY_CATEGORIES = ['doors', 'drawer_fronts'];
// Categories that live directly under the style folder (NOT under overlay)
const NON_OVERLAY_CATEGORIES = ['finished_ends'];
// Categories that sit directly under the context root (no style nesting)
const DIRECT_CATEGORIES = ['base', 'crown', 'drawers', 'case_parts', 'wall', 'counter_top', 'floor'];
// Sub-categories for specific categories
const SUB_CATEGORIES = {
    doors: ['shaker', 'slab'],
    finished_ends: ['flat', 'paneled']
};
// Grain directions (only slab doors have grain)
const GRAIN_DIRS = ['horizontal', 'vertical'];
const STAGING_DIR = path.join(SHOWROOM_DIR, 'staging');

// Auto-parse rules for Cabinet Vision mesh naming conventions
// Order matters: more specific patterns must come first
const AUTO_PARSE_RULES = [
    { pattern: /Door_Door/, category: 'doors' },
    { pattern: /Base_Cabinet_Assembly/, category: 'base' },
    { pattern: /Upper_Cabinet_Assembly/, category: 'base' },
    { pattern: /Tall_Cabinet_Assembly/, category: 'base' },
    { pattern: /Splash_CounterTop/, category: 'counter_top' },
    { pattern: /CounterTop_CounterTop/, category: 'counter_top' },
    { pattern: /Wall_Wall/, category: 'wall' },
    { pattern: /Molding_Molding_DrawerBox/, category: 'drawers' },
    { pattern: /Molding_Molding/, category: 'crown' },
    { pattern: /DrawerFront/, category: 'drawer_fronts' },
    { pattern: /DrawerBox/, category: 'drawers' },
    { pattern: /Cabinet_Widget/, category: 'case_parts' },
    { pattern: /Decorative_Window/, category: 'ignore' },
    { pattern: /^LN_Light/, category: 'ignore' },
    { pattern: /^PA_|^CVSc/, category: 'ignore' },
];

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

app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true, lastModified: true }));
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

    res.sendFile(manifestPath, (err) => {
        if (err) {
            if (res.headersSent) return;
            res.status(500).json({ success: false, error: 'Failed to read manifest' });
        }
    });
});

// --- TEXTURE CATALOG API ---

// Perceptual hash cache
let textureHashCache = null;
let textureHashCacheTime = 0;
let textureHashInProgress = null;
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

// Precomputed cosine and scaling factor tables for DCT-II (N=32)
const DCT_N = 32;
const DCT_COS_TABLE = new Float64Array(DCT_N * DCT_N);
const DCT_C_TABLE = new Float64Array(DCT_N);

for (let u = 0; u < DCT_N; u++) {
    for (let x = 0; x < DCT_N; x++) {
        DCT_COS_TABLE[u * DCT_N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * DCT_N));
    }
    DCT_C_TABLE[u] = u === 0 ? Math.sqrt(1.0 / DCT_N) : Math.sqrt(2.0 / DCT_N);
}

/**
 * SWAR population count for 32-bit integers.
 * Uses unsigned right shift (>>>) for predictable behavior with JavaScript's 32nd bit.
 */
/**
 * 2D Discrete Cosine Transform (DCT-II)
 * Optimized to O(N³) using separability and precomputed tables.
 */
function performDCT(pixels, N) {
    if (N !== DCT_N) {
        // Fallback for non-32 sizes (original O(N^4) logic)
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

    const intermediate = new Float64Array(DCT_N * DCT_N);
    const dct = new Float64Array(DCT_N * DCT_N);

    // DCT along rows
    for (let x = 0; x < DCT_N; x++) {
        const offset = x * DCT_N;
        for (let v = 0; v < DCT_N; v++) {
            let sum = 0;
            const cosOffset = v * DCT_N;
            for (let y = 0; y < DCT_N; y++) {
                sum += pixels[offset + y] * DCT_COS_TABLE[cosOffset + y];
            }
            intermediate[offset + v] = sum;
        }
    }

    // DCT along columns
    for (let v = 0; v < DCT_N; v++) {
        for (let u = 0; u < DCT_N; u++) {
            let sum = 0;
            const cosOffset = u * DCT_N;
            for (let x = 0; x < DCT_N; x++) {
                sum += intermediate[x * DCT_N + v] * DCT_COS_TABLE[cosOffset + x];
            }
            dct[u * DCT_N + v] = DCT_C_TABLE[u] * DCT_C_TABLE[v] * sum;
        }
    }

    return dct;
}

// Build hash index for all textures in the catalog
async function buildTextureHashIndex() {
    const now = Date.now();
    if (textureHashCache && (now - textureHashCacheTime) < HASH_CACHE_TTL) {
        return textureHashCache;
    }

    if (textureHashInProgress) return textureHashInProgress;

    textureHashInProgress = (async () => {
        const index = {};
        try {
            const entries = await fs.promises.readdir(TEXTURES_DIR, { withFileTypes: true });

            // Process categories in parallel
            await Promise.all(entries.map(async (entry) => {
                if (!entry.isDirectory() || entry.name === 'Uncategorized') return;

                const categoryPath = path.join(TEXTURES_DIR, entry.name);
                const isHidden = entry.name === 'Hidden';
                const items = await fs.promises.readdir(categoryPath, { withFileTypes: true });
                const categoryTextures = [];

                // 1. Process main textures first in parallel
                await Promise.all(items.map(async (item) => {
                    if (item.isDirectory()) return;
                    const file = item.name;
                    if (file === 'Thumbs.db' || file.startsWith('.')) return;
                    const ext = path.extname(file).toLowerCase();
                    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return;

                    try {
                        const filePath = path.join(categoryPath, file);
                        const buffer = await fs.promises.readFile(filePath);
                        const hash = await computePhash(buffer);
                        categoryTextures.push({
                            name: path.basename(file, ext),
                            file: file,
                            url: isHidden ? null : `/textures/${encodeURIComponent(entry.name)}/${encodeURIComponent(file)}`,
                            hidden: isHidden,
                            hash: hash.toString(),
                            hLow: Number(hash & 0xFFFFFFFFn),
                            hHigh: Number(hash >> 32n)
                        });
                    } catch (e) {
                        console.error(`[Texture] Hash error for ${file}: ${e.message}`);
                    }
                }));

                index[entry.name] = categoryTextures;

                // 2. Process variant hashes in the 'hashes/' sub-folder in parallel (once main textures are indexed)
                const hashFolderPath = path.join(categoryPath, 'hashes');
                if (fs.existsSync(hashFolderPath)) {
                    const variantFiles = await fs.promises.readdir(hashFolderPath);
                    await Promise.all(variantFiles.map(async (file) => {
                        if (file === 'Thumbs.db' || file.startsWith('.')) return;
                        const ext = path.extname(file).toLowerCase();
                        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return;

                        try {
                            const filePath = path.join(hashFolderPath, file);
                            const buffer = await fs.promises.readFile(filePath);
                            const hash = await computePhash(buffer);
                            let canonicalName = path.basename(file, ext).replace(/_\d+$/, '');
                            const canonical = index[entry.name].find(t => t.name === canonicalName);

                            if (canonical) {
                                index[entry.name].push({
                                    name: canonical.name,
                                    file: canonical.file,
                                    url: canonical.url,
                                    hidden: canonical.hidden,
                                    hash: hash.toString(),
                                    hLow: Number(hash & 0xFFFFFFFFn),
                                    hHigh: Number(hash >> 32n),
                                    isVariant: true,
                                    variantFile: file
                                });
                            } else {
                                console.warn(`[Texture] Variant ${file} found but no canonical texture '${canonicalName}' exists in ${entry.name}.`);
                            }
                        } catch (e) {
                            console.error(`[Texture] Variant hash error for ${file}: ${e.message}`);
                        }
                    }));
                }
            }));
        } catch (e) {
            console.error(`[Texture] Index build error: ${e.message}`);
        }

        textureHashCache = index;
        textureHashCacheTime = Date.now();
        textureHashInProgress = null;
        return index;
    })();

    return textureHashInProgress;
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
        const inLow = Number(inputHash & 0xFFFFFFFFn);
        const inHigh = Number(inputHash >> 32n);

        // Build/load hash index
        const index = await buildTextureHashIndex();

        // Find best match across all categories (excluding hidden)
        let bestMatch = null;
        let bestDistance = Infinity;
        const allMatches = [];

        for (const [category, textures] of Object.entries(index)) {
            for (const tex of textures) {
                const distance = hammingDistance(inLow, inHigh, tex.hLow, tex.hHigh);

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
        const inLow = Number(hash & 0xFFFFFFFFn);
        const inHigh = Number(hash >> 32n);
        let isMatched = false;

        for (const [category, textures] of Object.entries(index)) {
            for (const tex of textures) {
                const distance = hammingDistance(inLow, inHigh, tex.hLow, tex.hHigh);
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

    await Promise.all(files.map(async (file) => {
        // Skip Thumbs.db and system files
        if (file === 'Thumbs.db' || file.startsWith('.')) return;
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.tga', '.bmp'].includes(ext)) {
            const srcPath = path.join(imagesDir, file);
            const destPath = path.join(uncategorizedDir, file);

            // Avoid duplicates
            if (fs.existsSync(destPath)) return;

            try {
                const buffer = await fs.promises.readFile(srcPath);
                const hash = await computePhash(buffer);
                const inLow = Number(hash & 0xFFFFFFFFn);
                const inHigh = Number(hash >> 32n);
                let isMatched = false;

                for (const [category, textures] of Object.entries(index)) {
                    for (const tex of textures) {
                        const distance = hammingDistance(inLow, inHigh, tex.hLow, tex.hHigh);
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
    }));

    if (extracted > 0) {
        textureHashCache = null; // Invalidate cache since new textures were added
        console.log(`[DAE Texture] Extracted ${extracted} texture(s) from ${path.basename(daeFilePath)}`);
    }
}

// Generate a texture manifest (sidecar JSON) for a GLB file
// Keyed by GLTF material name so the client can look up by mat.name reliably
async function generateTextureManifest(glbPath) {
    try {
        const glbBuffer = await fs.promises.readFile(glbPath);
        const resourceDirectory = path.dirname(glbPath);
        const result = await gltfPipeline.glbToGltf(glbBuffer, { resourceDirectory });
        const gltf = result.gltf;

        if (!gltf.materials || !gltf.images || !gltf.bufferViews) return;

        const libraryIndex = await buildTextureHashIndex();
        const manifest = { materials: {} };

        // Parse GLB header to find BIN chunk offset
        const jsonChunkLength = glbBuffer.readUInt32LE(12);
        const binChunkOffset = 12 + 8 + jsonChunkLength + 8;

        // Cache image hashes to avoid re-computing when multiple materials share a texture
        const imageHashCache = new Map();

        const getImageData = (imageIdx) => {
            const image = gltf.images[imageIdx];
            if (!image || image.bufferView === undefined) return null;
            const bufferView = gltf.bufferViews[image.bufferView];
            if (gltf.buffers && gltf.buffers[bufferView.buffer] && gltf.buffers[bufferView.buffer].uri) {
                const base64 = gltf.buffers[bufferView.buffer].uri.split(',')[1];
                let data = Buffer.from(base64, 'base64');
                const byteOffset = bufferView.byteOffset || 0;
                return data.subarray(byteOffset, byteOffset + bufferView.byteLength);
            }
            const byteOffset = bufferView.byteOffset || 0;
            return Buffer.from(glbBuffer.subarray(binChunkOffset + byteOffset, binChunkOffset + byteOffset + bufferView.byteLength));
        };

        await Promise.all(gltf.materials.map(async (gltfMat) => {
            try {
                const matName = gltfMat.name || '';
                const pbr = gltfMat.pbrMetallicRoughness;
                if (!pbr || !pbr.baseColorTexture) return;

                const textureIdx = pbr.baseColorTexture.index;
                const imageIdx = gltf.textures && gltf.textures[textureIdx] ? gltf.textures[textureIdx].source : undefined;
                if (imageIdx === undefined) return;

                // Reuse cached hash for this image index
                let inLow, inHigh;
                if (imageHashCache.has(imageIdx)) {
                    ({ inLow, inHigh } = imageHashCache.get(imageIdx));
                } else {
                    const imageData = getImageData(imageIdx);
                    if (!imageData || imageData.length === 0) return;
                    const inputHash = await computePhash(imageData);
                    inLow = Number(inputHash & 0xFFFFFFFFn);
                    inHigh = Number(inputHash >> 32n);
                    imageHashCache.set(imageIdx, { inLow, inHigh });
                }

                let bestMatch = null;
                let bestDistance = Infinity;
                const allMatches = [];

                for (const [category, textures] of Object.entries(libraryIndex)) {
                    for (const tex of textures) {
                        const distance = hammingDistance(inLow, inHigh, tex.hLow, tex.hHigh);
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

                // Key by material name — client matches via prevMat.name
                manifest.materials[matName] = {
                    matched: isMatched,
                    bestMatch: isMatched ? { name: bestMatch.name, url: bestMatch.url, category: bestMatch.category } : null,
                    bestCategory: (isMatched && bestMatch) ? bestMatch.category : null,
                    isHidden: isMatched && bestMatch && !!bestMatch.hidden,
                    distance: bestDistance,
                    similarTextures: allMatches.slice(0, 12).map(t => ({ name: t.name, url: t.url, category: t.category, distance: t.distance }))
                };
            } catch (e) {
                console.error(`[Texture Manifest] Error processing material "${gltfMat.name}": ${e.message}`);
            }
        }));

        // Write sidecar JSON
        const manifestPath = glbPath.replace(/\.glb$/i, '.textures.json');
        await fs.promises.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
        console.log(`[Texture Manifest] Generated: ${path.basename(manifestPath)} (${Object.keys(manifest.materials).length} materials)`);
    } catch (e) {
        console.error(`[Texture Manifest] Error: ${e.message}`);
    }
}

// Batch generate manifests for all GLBs in a directory
async function generateAllManifests(dir, force = false) {
    try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await generateAllManifests(fullPath, force);
            } else if (entry.name.toLowerCase().endsWith('.glb')) {
                const manifestPath = fullPath.replace(/\.glb$/i, '.textures.json');
                if (!force && fs.existsSync(manifestPath)) {
                    try {
                        const [glbStat, manifestStat] = await Promise.all([
                            fs.promises.stat(fullPath),
                            fs.promises.stat(manifestPath)
                        ]);
                        if (manifestStat.mtimeMs >= glbStat.mtimeMs) continue;
                    } catch { /* ignore stat errors, just regenerate */ }
                }
                await generateTextureManifest(fullPath);
            }
        }
    } catch (e) {
        console.error(`[Texture Manifest] Batch error in ${dir}: ${e.message}`);
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
    const roomName = path.basename(filePath, '.dae'); // Keep original dae name
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
    const roomName = path.basename(filePath, '.dae'); // Keep original dae name
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

// --- SHOWROOM APIs ---

// Ensure Showroom directory structure exists
// Layout: Showroom/context/style/[overlay]/category/subCategory/[grain]
//         Showroom/context/directCategory/
function ensureShowroomDirs() {
    const mk = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
    mk(SHOWROOM_DIR);
    mk(path.join(SHOWROOM_DIR, 'configs'));
    mk(STAGING_DIR);

    for (const ctx of SHOWROOM_CONTEXTS) {
        // Direct categories (no style nesting)
        for (const cat of DIRECT_CATEGORIES) {
            mk(path.join(SHOWROOM_DIR, ctx, cat));
        }

        for (const style of SHOWROOM_STYLES) {
            const styleDir = path.join(SHOWROOM_DIR, ctx, style);

            if (style === 'face_frame') {
                // Overlay categories go inside overlay folders
                for (const overlay of SHOWROOM_OVERLAYS) {
                    for (const cat of OVERLAY_CATEGORIES) {
                        const catDir = path.join(styleDir, overlay, cat);
                        if (SUB_CATEGORIES[cat]) {
                            for (const sub of SUB_CATEGORIES[cat]) {
                                if (cat === 'doors' && sub === 'slab') {
                                    for (const grain of GRAIN_DIRS) {
                                        mk(path.join(catDir, sub, grain));
                                    }
                                } else {
                                    mk(path.join(catDir, sub));
                                }
                            }
                        } else {
                            mk(catDir);
                        }
                    }
                }
                // Non-overlay categories go directly under style (finished_ends)
                for (const cat of NON_OVERLAY_CATEGORIES) {
                    const catDir = path.join(styleDir, cat);
                    if (SUB_CATEGORIES[cat]) {
                        for (const sub of SUB_CATEGORIES[cat]) {
                            mk(path.join(catDir, sub));
                        }
                    } else {
                        mk(catDir);
                    }
                }
            } else {
                // Non-face-frame styles: all cats go directly under style (no overlays)
                for (const cat of [...OVERLAY_CATEGORIES, ...NON_OVERLAY_CATEGORIES]) {
                    const catDir = path.join(styleDir, cat);
                    if (SUB_CATEGORIES[cat]) {
                        for (const sub of SUB_CATEGORIES[cat]) {
                            if (cat === 'doors' && sub === 'slab') {
                                for (const grain of GRAIN_DIRS) {
                                    mk(path.join(catDir, sub, grain));
                                }
                            } else {
                                mk(path.join(catDir, sub));
                            }
                        }
                    } else {
                        mk(catDir);
                    }
                }
            }
        }
    }
}
ensureShowroomDirs();

// Serve showroom GLB files
app.use('/showroom', express.static(SHOWROOM_DIR, {
    etag: true,
    lastModified: true,
    maxAge: 0,
    cacheControl: true
}));

// Helper: list GLB files in a directory
async function listGlbs(dir) {
    try {
        const files = await fs.promises.readdir(dir);
        return files
            .filter(f => f.toLowerCase().endsWith('.glb') && !f.toLowerCase().endsWith('.full.glb'))
            .map(f => {
                const baseName = path.basename(f, '.glb');
                const tagsFile = path.join(dir, `${baseName}.tags.json`);
                return { file: f, name: baseName.replace(/_/g, ' '), tagged: fs.existsSync(tagsFile) };
            });
    } catch { return []; }
}

// Helper: build nested tree for a category with sub-categories and grain
async function buildCatTree(catDir, cat) {
    const subs = SUB_CATEGORIES[cat];
    if (!subs) {
        return { files: await listGlbs(catDir) };
    }
    const tree = {};
    for (const sub of subs) {
        const subDir = path.join(catDir, sub);
        if (cat === 'doors' && sub === 'slab') {
            tree[sub] = {};
            for (const grain of GRAIN_DIRS) {
                tree[sub][grain] = { files: await listGlbs(path.join(subDir, grain)) };
            }
        } else {
            tree[sub] = { files: await listGlbs(subDir) };
        }
    }
    return tree;
}

// GET /api/showroom/categories - Deeply nested hierarchy
app.get('/api/showroom/categories', async (req, res) => {
    try {
        const result = {};
        for (const ctx of SHOWROOM_CONTEXTS) {
            result[ctx] = {};
            // Direct categories
            for (const cat of DIRECT_CATEGORIES) {
                result[ctx][cat] = { files: await listGlbs(path.join(SHOWROOM_DIR, ctx, cat)) };
            }
            // Style-nested categories
            for (const style of SHOWROOM_STYLES) {
                result[ctx][style] = {};
                if (style === 'face_frame') {
                    for (const overlay of SHOWROOM_OVERLAYS) {
                        result[ctx][style][overlay] = {};
                        for (const cat of OVERLAY_CATEGORIES) {
                            result[ctx][style][overlay][cat] = await buildCatTree(path.join(SHOWROOM_DIR, ctx, style, overlay, cat), cat);
                        }
                    }
                    for (const cat of NON_OVERLAY_CATEGORIES) {
                        result[ctx][style][cat] = await buildCatTree(path.join(SHOWROOM_DIR, ctx, style, cat), cat);
                    }
                } else {
                    for (const cat of [...OVERLAY_CATEGORIES, ...NON_OVERLAY_CATEGORIES]) {
                        result[ctx][style][cat] = await buildCatTree(path.join(SHOWROOM_DIR, ctx, style, cat), cat);
                    }
                }
            }
        }
        res.json({ success: true, categories: result });
    } catch (e) {
        console.error(`[Showroom] Categories error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to list showroom categories' });
    }
});

// Helper: safely resolve a deep showroom path (prevents traversal)
function safeShowroomPath(...segments) {
    const resolved = path.join(SHOWROOM_DIR, ...segments);
    const rel = path.relative(SHOWROOM_DIR, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return resolved;
}

// GET /api/showroom/part/{*path} - Serve GLB URL for a showroom part at any depth
app.get('/api/showroom/part/{*path}', (req, res) => {
    const deepPath = req.params.path;
    if (!deepPath || !/\.glb$/i.test(deepPath)) return res.status(400).json({ success: false, error: 'Invalid path' });

    const filePath = safeShowroomPath(deepPath);
    if (!filePath) return res.status(403).json({ success: false, error: 'Forbidden' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Part not found' });

    res.json({ success: true, url: `/showroom/${deepPath}` });
});

// GET /api/showroom/tags/{*path} - Get tags for a showroom part at any depth
app.get('/api/showroom/tags/{*path}', async (req, res) => {
    const deepPath = req.params.path;
    const baseName = path.basename(deepPath, '.glb').replace(/\.tags$/, '');
    const dir = path.dirname(deepPath);
    const tagsPath = safeShowroomPath(dir, `${baseName}.tags.json`);
    if (!tagsPath) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
        const data = await fs.promises.readFile(tagsPath, 'utf8');
        res.type('json').send(`{"success":true,"tags":${data}}`);
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'Tags not found' });
        res.status(500).json({ success: false, error: 'Failed to read tags' });
    }
});

// POST /api/showroom/tags/{*path} - Save tags for a showroom part at any depth
app.post('/api/showroom/tags/{*path}', express.json(), async (req, res) => {
    const deepPath = req.params.path;
    const baseName = path.basename(deepPath, '.glb');
    if (!/^[a-zA-Z0-9\-_ ]+$/.test(baseName)) return res.status(400).json({ success: false, error: 'Invalid file name' });

    const dir = path.dirname(deepPath);
    const tagsPath = safeShowroomPath(dir, `${baseName}.tags.json`);
    if (!tagsPath) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
        const tags = req.body;
        if (!tags || typeof tags !== 'object') return res.status(400).json({ success: false, error: 'Invalid tags data' });
        await fs.promises.writeFile(tagsPath, JSON.stringify(tags, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to save tags' });
    }
});

// POST /api/showroom/config - Save a showroom configuration with a 5-digit PIN
app.post('/api/showroom/config', express.json({ limit: '1mb' }), async (req, res) => {
    const configsDir = path.join(SHOWROOM_DIR, 'configs');

    try {
        const config = req.body;
        if (!config || typeof config !== 'object' || Array.isArray(config)) return res.status(400).json({ success: false, error: 'Invalid config' });

        // Generate unique 5-digit PIN (10000-99999)
        let pin;
        let attempts = 0;
        do {
            pin = String(10000 + Math.floor(Math.random() * 90000));
            attempts++;
            if (attempts > 100) return res.status(500).json({ success: false, error: 'Could not generate unique PIN' });
        } while (fs.existsSync(path.join(configsDir, `${pin}.json`)));

        config.pin = pin;
        config.createdAt = new Date().toISOString();

        await fs.promises.writeFile(path.join(configsDir, `${pin}.json`), JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true, pin });
    } catch (e) {
        console.error(`[Showroom] Config save error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to save config' });
    }
});

// GET /api/showroom/config/:pin - Load a saved showroom configuration
app.get('/api/showroom/config/:pin', async (req, res) => {
    const pin = req.params.pin;

    // Validate PIN format
    if (!/^\d{5}$/.test(pin)) return res.status(400).json({ success: false, error: 'Invalid PIN format' });

    const configPath = path.join(SHOWROOM_DIR, 'configs', `${pin}.json`);
    const rel = path.relative(SHOWROOM_DIR, configPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
        const data = await fs.promises.readFile(configPath, 'utf8');
        res.type('json').send(`{"success":true,"config":${data}}`);
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'Config not found' });
        res.status(500).json({ success: false, error: 'Failed to load config' });
    }
});

// GET /api/showroom/meshes/{*path} - List mesh names in a GLB at any depth (for tagger)
app.get('/api/showroom/meshes/{*path}', async (req, res) => {
    const deepPath = req.params.path;
    if (!deepPath || !/\.glb$/i.test(deepPath)) return res.status(400).json({ success: false, error: 'Invalid path' });

    const filePath = safeShowroomPath(deepPath);
    if (!filePath) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
        const glbBuffer = await fs.promises.readFile(filePath);
        const result = await gltfPipeline.glbToGltf(glbBuffer, { resourceDirectory: path.dirname(filePath) });
        const gltf = result.gltf;

        // Extract mesh names from the scene graph
        const meshNames = [];
        const extractMeshes = (nodes, allNodes) => {
            if (!nodes) return;
            for (const nodeIdx of nodes) {
                const node = allNodes[nodeIdx];
                if (node.mesh !== undefined && gltf.meshes && gltf.meshes[node.mesh]) {
                    meshNames.push(node.name || `Node_${nodeIdx}`);
                }
                if (node.children) extractMeshes(node.children, allNodes);
            }
        };

        if (gltf.scenes && gltf.nodes) {
            const sceneNodes = gltf.scenes[gltf.scene || 0]?.nodes || [];
            extractMeshes(sceneNodes, gltf.nodes);
        }

        res.json({ success: true, meshes: meshNames });
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found' });
        console.error(`[Showroom] Mesh list error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to read mesh names' });
    }
});

// --- STAGING APIs ---

// Helper: auto-categorize mesh names using Cabinet Vision naming patterns
function autoCategorizeMeshes(gltf) {
    const categories = {};
    if (!gltf.nodes) return categories;

    for (let i = 0; i < gltf.nodes.length; i++) {
        const node = gltf.nodes[i];
        if (node.mesh === undefined) continue; // skip non-mesh nodes
        const name = node.name || `Node_${i}`;
        let matched = false;
        for (const rule of AUTO_PARSE_RULES) {
            if (rule.pattern.test(name)) {
                categories[name] = rule.category;
                matched = true;
                break;
            }
        }
        if (!matched) categories[name] = 'ignore';
    }
    return categories;
}

function sanitizeGlbForPipeline(glbBuffer) {
    try {
        const magic = glbBuffer.readUInt32LE(0);
        if (magic !== 0x46546C67) return glbBuffer;
        
        const jsonChunkLength = glbBuffer.readUInt32LE(12);
        const jsonString = glbBuffer.toString('utf8', 20, 20 + jsonChunkLength);
        const gltf = JSON.parse(jsonString);
        let modified = false;
        
        if (gltf.images) {
            for (const img of gltf.images) {
                if (img.uri && !img.uri.startsWith('data:')) {
                    img.uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
                    modified = true;
                }
            }
        }
        if (!modified) return glbBuffer;
        
        let newJsonString = JSON.stringify(gltf);
        let newJsonLength = Buffer.byteLength(newJsonString, 'utf8');
        const padding = (4 - (newJsonLength % 4)) % 4;
        for (let i = 0; i < padding; i++) newJsonString += ' ';
        newJsonLength += padding;
        
        const binChunkOffset = 20 + jsonChunkLength;
        const binData = glbBuffer.length > binChunkOffset ? glbBuffer.slice(binChunkOffset) : Buffer.alloc(0);
        
        const newTotalLength = 20 + newJsonLength + binData.length;
        const newBuffer = Buffer.alloc(newTotalLength);
        
        newBuffer.writeUInt32LE(0x46546C67, 0);
        newBuffer.writeUInt32LE(2, 4);
        newBuffer.writeUInt32LE(newTotalLength, 8);
        
        newBuffer.writeUInt32LE(newJsonLength, 12);
        newBuffer.writeUInt32LE(0x4E4F534A, 16);
        newBuffer.write(newJsonString, 20, newJsonLength, 'utf8');
        
        if (binData.length > 0) binData.copy(newBuffer, 20 + newJsonLength);
        
        return newBuffer;
    } catch { return glbBuffer; }
}

// Helper: extract GLB nodes and build category-specific glTF documents
// destinations maps category name -> relative path inside SHOWROOM_DIR
async function splitGlbByCategories(glbPath, meshCategories, destinations, outputBaseName) {
    let glbBuffer = await fs.promises.readFile(glbPath);
    glbBuffer = sanitizeGlbForPipeline(glbBuffer);
    const result = await gltfPipeline.glbToGltf(glbBuffer, { resourceDirectory: path.dirname(glbPath) });
    const gltf = result.gltf;

    // Group node indices by category
    const categoryNodes = {};
    for (let i = 0; i < gltf.nodes.length; i++) {
        const node = gltf.nodes[i];
        if (node.mesh === undefined) continue;
        const name = node.name || `Node_${i}`;
        const cat = meshCategories[name];
        if (!cat || cat === 'ignore') continue;
        if (!categoryNodes[cat]) categoryNodes[cat] = [];
        categoryNodes[cat].push(i);
    }

    const results = {};

    for (const [cat, nodeIndices] of Object.entries(categoryNodes)) {
        // Resolve destination path for this category
        const destRelPath = destinations[cat];
        if (!destRelPath) {
            console.warn(`[Staging] No destination path for category '${cat}', skipping`);
            continue;
        }
        const outputDir = safeShowroomPath(destRelPath);
        if (!outputDir) {
            results[cat] = { error: 'Forbidden destination path' };
            continue;
        }

        // Deep clone the gltf
        const newGltf = JSON.parse(JSON.stringify(gltf));

        // Collect used resources
        const usedMeshes = new Set();
        const usedMaterials = new Set();

        for (const idx of nodeIndices) {
            const node = newGltf.nodes[idx];
            if (node.mesh !== undefined) usedMeshes.add(node.mesh);
        }

        // Find materials from used meshes
        for (const meshIdx of usedMeshes) {
            const mesh = newGltf.meshes[meshIdx];
            if (!mesh || !mesh.primitives) continue;
            for (const prim of mesh.primitives) {
                if (prim.material !== undefined) usedMaterials.add(prim.material);
            }
        }

        // Build remapping for meshes and materials
        const meshRemap = {};
        let newMeshIdx = 0;
        for (const idx of [...usedMeshes].sort((a, b) => a - b)) {
            meshRemap[idx] = newMeshIdx++;
        }

        const matRemap = {};
        let newMatIdx = 0;
        for (const idx of [...usedMaterials].sort((a, b) => a - b)) {
            matRemap[idx] = newMatIdx++;
        }

        // Build new nodes (only kept ones, flattened as root children)
        const newNodes = [];
        const nodeRemap = {};
        for (const idx of nodeIndices) {
            nodeRemap[idx] = newNodes.length;
            const node = { ...newGltf.nodes[idx] };
            if (node.mesh !== undefined) node.mesh = meshRemap[node.mesh];
            if (!node.name) node.name = `Node_${idx}`;
            node.children = undefined; // flatten hierarchy
            newNodes.push(node);
        }

        // Build new meshes with remapped material indices
        const newMeshes = [];
        for (const oldIdx of [...usedMeshes].sort((a, b) => a - b)) {
            const mesh = JSON.parse(JSON.stringify(newGltf.meshes[oldIdx]));
            for (const prim of mesh.primitives || []) {
                if (prim.material !== undefined) prim.material = matRemap[prim.material];
            }
            newMeshes.push(mesh);
        }

        // Build new materials
        const newMaterials = [];
        for (const oldIdx of [...usedMaterials].sort((a, b) => a - b)) {
            newMaterials.push(newGltf.materials[oldIdx]);
        }

        // Update the glTF document
        newGltf.nodes = newNodes;
        newGltf.meshes = newMeshes;
        newGltf.materials = newMaterials;
        newGltf.scenes = [{ name: `${cat}_scene`, nodes: newNodes.map((_, i) => i) }];
        newGltf.scene = 0;

        // Convert back to GLB (embed textures)
        try {
            const glbResult = await gltfPipeline.gltfToGlb(newGltf, { resourceDirectory: path.dirname(glbPath) });
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

            const outputFile = path.join(outputDir, `${outputBaseName}.glb`);
            await fs.promises.writeFile(outputFile, glbResult.glb);

            // Also save the full GLB as .full.glb for re-tagging
            const fullFile = path.join(outputDir, `${outputBaseName}.full.glb`);
            await fs.promises.writeFile(fullFile, await fs.promises.readFile(glbPath));

            // Generate .tags.json for the split category
            const tags = {
                file: `${outputBaseName}.glb`,
                category: cat,
                destPath: destRelPath,
                extracted: false,
                meshTags: {},
                taggedMeshes: []
            };
            for (const idx of nodeIndices) {
                const name = gltf.nodes[idx].name || `Node_${idx}`;
                tags.meshTags[name] = 'tagged';
                tags.taggedMeshes.push(name);
            }
            const tagsPath = path.join(outputDir, `${outputBaseName}.tags.json`);
            await fs.promises.writeFile(tagsPath, JSON.stringify(tags, null, 2), 'utf8');

            results[cat] = { file: `${outputBaseName}.glb`, destPath: destRelPath, meshCount: nodeIndices.length };
            console.log(`[Staging] Split ${cat}: ${nodeIndices.length} meshes -> ${outputFile}`);
        } catch (e) {
            console.error(`[Staging] Failed to split ${cat}: ${e.message}`);
            results[cat] = { error: e.message };
        }
    }

    return results;
}

// GET /api/showroom/staging - List staged GLB files
app.get('/api/showroom/staging', async (req, res) => {
    try {
        const findGlbs = async (dir, rootDir) => {
            const results = [];
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = require('path').join(dir, entry.name);
                if (entry.isDirectory()) {
                    results.push(...await findGlbs(fullPath, rootDir));
                } else if (entry.name.toLowerCase().endsWith('.glb')) {
                    const relativePath = require('path').relative(rootDir, fullPath).replace(/\\/g, '/');
                    const baseName = require('path').basename(entry.name, '.glb');
                    const tagsFile = require('path').join(dir, `${baseName}.tags.json`);
                    results.push({
                        file: relativePath,
                        name: baseName.replace(/_/g, ' '),
                        tagged: fs.existsSync(tagsFile)
                    });
                }
            }
            return results;
        };
        const glbs = await findGlbs(STAGING_DIR, STAGING_DIR);
        res.json({ success: true, files: glbs });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to list staging files' });
    }
});

// Serve staging GLB files
app.use('/showroom/staging', express.static(STAGING_DIR, {
    etag: true, lastModified: true, maxAge: 0, cacheControl: true
}));

// GET /api/showroom/staging/meshes/:file - Extract mesh names from a staged GLB
app.get('/api/showroom/staging/meshes/:file', async (req, res) => {
    const safeFile = req.params.file;
    if (!/^[a-zA-Z0-9\-_ \/]+\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);
    const rel = path.relative(STAGING_DIR, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
        const glbBuffer = await fs.promises.readFile(filePath);
        const chunkLength = glbBuffer.readUInt32LE(12);
        const jsonString = glbBuffer.toString('utf8', 20, 20 + chunkLength);
        const gltf = JSON.parse(jsonString);

        const meshNames = [];
        if (gltf.nodes) {
            for (let i = 0; i < gltf.nodes.length; i++) {
                const node = gltf.nodes[i];
                if (node.mesh !== undefined && gltf.meshes && gltf.meshes[node.mesh]) {
                    meshNames.push(node.name || `Node_${i}`);
                }
            }
        }

        res.json({ success: true, meshes: meshNames });
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found' });
        console.error(`[Staging] Mesh list error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to read mesh names' });
    }
});

// POST /api/showroom/staging/parse/:file - Auto-parse a staged GLB by mesh names
app.post('/api/showroom/staging/parse/:file', async (req, res) => {
    const safeFile = req.params.file;
    if (!/^[a-zA-Z0-9\-_ \/]+\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);
    const rel = path.relative(STAGING_DIR, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
        console.log('[Staging] Parsing file:', filePath);
        const glbBuffer = await fs.promises.readFile(filePath);
        const chunkLength = glbBuffer.readUInt32LE(12);
        const jsonString = glbBuffer.toString('utf8', 20, 20 + chunkLength);
        const gltf = JSON.parse(jsonString);
        
        const categories = autoCategorizeMeshes(gltf);

        // Build summary
        const summary = {};
        for (const [name, cat] of Object.entries(categories)) {
            if (!summary[cat]) summary[cat] = 0;
            summary[cat]++;
        }

        res.json({ success: true, meshCategories: categories, summary });
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found' });
        console.error(`[Staging] Parse error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to parse GLB' });
    }
});

// POST /api/showroom/staging/tags/:file - Save staging tags
app.post('/api/showroom/staging/tags/:file', express.json({ limit: '10mb' }), async (req, res) => {
    const safeFile = req.params.file.replace(/\.glb$/i, '');
    if (!/^[a-zA-Z0-9\-_ \/]+$/.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file name' });

    const tagsPath = path.join(STAGING_DIR, `${safeFile}.tags.json`);
    const rel = path.relative(STAGING_DIR, tagsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
        const tags = req.body;
        if (!tags || typeof tags !== 'object') return res.status(400).json({ success: false, error: 'Invalid tags data' });
        await fs.promises.writeFile(tagsPath, JSON.stringify(tags, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to save tags' });
    }
});

// GET /api/showroom/staging/tags/:file - Get staging tags
app.get('/api/showroom/staging/tags/:file', async (req, res) => {
    const safeFile = req.params.file.replace(/\.glb$/i, '').replace(/\.tags$/i, '');
    const tagsPath = path.join(STAGING_DIR, `${safeFile}.tags.json`);
    const rel = path.relative(STAGING_DIR, tagsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
        const data = await fs.promises.readFile(tagsPath, 'utf8');
        res.type('json').send(`{"success":true,"tags":${data}}`);
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'Tags not found' });
        res.status(500).json({ success: false, error: 'Failed to read tags' });
    }
});

// POST /api/showroom/staging/split/:file - Split staged GLB into deep showroom hierarchy
// Payload: { context, style, overlay?, meshCategories, categorySettings?, outputName? }
// categorySettings maps category -> { subCategory?, grain? } for per-category overrides
app.post('/api/showroom/staging/split/:file', express.json({ limit: '10mb' }), async (req, res) => {
    const safeFile = req.params.file;
    if (!/^[a-zA-Z0-9\-_ \/]+\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);
    const rel = path.relative(STAGING_DIR, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });

    const { context, style, overlay, meshCategories, categorySettings, outputName } = req.body;
    if (!context || !SHOWROOM_CONTEXTS.includes(context)) return res.status(400).json({ success: false, error: 'Invalid context' });
    if (!style || !SHOWROOM_STYLES.includes(style)) return res.status(400).json({ success: false, error: 'Invalid style' });
    if (style === 'face_frame' && overlay && !SHOWROOM_OVERLAYS.includes(overlay)) return res.status(400).json({ success: false, error: 'Invalid overlay' });
    if (!meshCategories || typeof meshCategories !== 'object') return res.status(400).json({ success: false, error: 'Missing mesh categories' });

    const baseName = outputName || path.basename(safeFile, '.glb');
    if (!/^[a-zA-Z0-9\-_ ]+$/.test(baseName)) return res.status(400).json({ success: false, error: 'Invalid output name' });

    // Build destination paths for each unique category in meshCategories
    const destinations = {};
    const settings = categorySettings || {};
    const uniqueCats = [...new Set(Object.values(meshCategories).filter(c => c !== 'ignore'))];

    for (const cat of uniqueCats) {
        const catSettings = settings[cat] || {};
        let destParts;

        if (DIRECT_CATEGORIES.includes(cat)) {
            // Direct categories: context/category
            destParts = [context, cat];
        } else if (NON_OVERLAY_CATEGORIES.includes(cat)) {
            // Non-overlay categories (finished_ends): context/style/category[/subCategory]
            destParts = [context, style, cat];
            if (catSettings.subCategory && SUB_CATEGORIES[cat]?.includes(catSettings.subCategory)) {
                destParts.push(catSettings.subCategory);
            }
        } else if (OVERLAY_CATEGORIES.includes(cat)) {
            if (style === 'face_frame' && overlay) {
                // Overlay categories: context/style/overlay/category[/subCategory[/grain]]
                destParts = [context, style, overlay, cat];
            } else {
                // Non-face-frame: context/style/category[/subCategory[/grain]]
                destParts = [context, style, cat];
            }
            if (catSettings.subCategory && SUB_CATEGORIES[cat]?.includes(catSettings.subCategory)) {
                destParts.push(catSettings.subCategory);
                // Grain only for slab doors
                if (cat === 'doors' && catSettings.subCategory === 'slab' && catSettings.grain && GRAIN_DIRS.includes(catSettings.grain)) {
                    destParts.push(catSettings.grain);
                }
            }
        } else {
            // Unknown category - fall back to context/cat
            destParts = [context, cat];
        }

        destinations[cat] = destParts.join('/');
    }

    try {
        const results = await splitGlbByCategories(filePath, meshCategories, destinations, baseName);
        res.json({ success: true, results });
    } catch (e) {
        console.error(`[Staging] Split error: ${e.message}`);
        res.status(500).json({ success: false, error: 'Failed to split GLB' });
    }
});

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

        // Run after a short delay so DAE conversions start first
        setTimeout(() => generateAllManifests(JOBS_DIR, false), 5000);
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

    // Watch staging folder for DAE files to auto-convert
    chokidar.watch(STAGING_DIR, {
        ignoreInitial: true,
        ignored: [/(\\|\/)\./, '**/*.glb', '**/*.json'],
        awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 100 }
    }).on('add', async (fp) => {
        if (fp.toLowerCase().endsWith('.dae')) {
            console.log(`[Staging] New DAE detected: ${path.basename(fp)}`);
            const dir = path.dirname(fp);
            const inputFilename = path.basename(fp);
            const baseName = path.basename(fp, path.extname(fp));
            const outputGlb = `${baseName.replace(/ /g, '_')}.glb`;
            const finalGlb = path.join(dir, `${baseName}.glb`);

            // Skip if GLB already exists and is newer
            try {
                const [daeStat, glbStat] = await Promise.all([
                    fs.promises.stat(fp),
                    fs.promises.stat(finalGlb)
                ]);
                if (glbStat.mtimeMs > daeStat.mtimeMs) {
                    console.log(`[Staging] GLB already up-to-date for ${baseName}`);
                    return;
                }
            } catch (e) {
                // Ignore stat errors if finalGlb doesn't exist
            }

            // Reuse the clean + convert pipeline
            cleanDae(fp).then(() => {
                const pathPrefix = process.platform === 'win32' ? '.\\' : './';
                const safeInputPath = `${pathPrefix}${inputFilename}`;
                const safeOutputPath = `${pathPrefix}${outputGlb}`;
                execFile(ASSIMP_PATH, ['export', safeInputPath, safeOutputPath, 'glb2', '-tri', '-gn', '-jiv', '-et', '-emb'], { cwd: dir }, async (err, stdout, stderr) => {
                    if (err) {
                        console.error(`[Staging] Conversion failed for ${baseName}: ${stderr || err.message}`);
                    } else {
                        const genGlb = path.join(dir, outputGlb);
                        if (outputGlb !== `${baseName}.glb`) {
                            try { await fs.promises.rename(genGlb, finalGlb); } catch (e) { /* ignore */ }
                        }
                        console.log(`[Staging] Converted: ${baseName}.glb`);
                    }
                });
            });
        }
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
                    await generateAllManifests(JOBS_DIR, true);
                    console.log('[Texture] All manifests regenerated.');
                }
            }, 60000); // Wait 1 minute after last change before re-scanning
        }
    });
}

module.exports = app;
module.exports.cleanDae = cleanDae;
module.exports.extractTexturesFromDaeImages = extractTexturesFromDaeImages;
module.exports.SHOWROOM_DIR = SHOWROOM_DIR;
module.exports.hammingDistance = hammingDistance;
module.exports.popcount32 = popcount32;