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

const app = express();
const APP_VERSION = "1.0.4";

// --- CONFIG ---
const PORT = parseInt(process.env.PORT) || 5021;
const JOBS_DIR = process.env.JOBS_DIR ? path.resolve(process.env.JOBS_DIR) : path.join(__dirname, 'jobs');
const TEXTURES_DIR = process.env.TEXTURES_DIR ? path.resolve(process.env.TEXTURES_DIR) : path.join(__dirname, 'textures');
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

// Average Hash (aHash) - simple perceptual fingerprint
function averageHash(imageBuffer, hashSize = 8) {
    // Convert image buffer to grayscale average using a small canvas approach
    // For Node.js, we'll use a simple pixel sampling method
    const pixels = [];
    const len = imageBuffer.length;
    const step = Math.max(1, Math.floor(len / (hashSize * hashSize * 4)));

    for (let i = 0; i < len && pixels.length < hashSize * hashSize; i += step) {
        if (i + 2 < len) {
            // Simple RGB to grayscale
            const r = imageBuffer[i] || 0;
            const g = imageBuffer[i + 1] || 0;
            const b = imageBuffer[i + 2] || 0;
            pixels.push(0.299 * r + 0.587 * g + 0.114 * b);
        }
    }

    // Pad if needed
    while (pixels.length < hashSize * hashSize) pixels.push(0);

    // Calculate average
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;

    // Generate hash bits
    let hash = 0n;
    for (let i = 0; i < hashSize * hashSize; i++) {
        if (pixels[i] >= avg) hash |= (1n << BigInt(i));
    }
    return hash;
}

// Hamming distance between two hashes
function hammingDistance(hash1, hash2) {
    let diff = hash1 ^ hash2;
    let count = 0;
    while (diff > 0n) {
        count += Number(diff & 1n);
        diff >>= 1n;
    }
    return count;
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
                                url: `/textures/${encodeURIComponent(entry.name)}/${encodeURIComponent(file)}`,
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
            .filter(e => e.isDirectory() && e.name !== 'Uncategorized')
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

        // Find best match across all categories
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
                if (distance <= 20) { // Threshold for "similar enough"
                    allMatches.push({ ...tex, category, distance });
                }
            }
        }

        // Sort matches by distance
        allMatches.sort((a, b) => a.distance - b.distance);

        // If no good match found, copy to Uncategorized
        const MATCH_THRESHOLD = 30;
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
}

module.exports = app;
module.exports.cleanDae = cleanDae;