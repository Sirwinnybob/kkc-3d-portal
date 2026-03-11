const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const chokidar = require('chokidar');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jobsAuth = require('./middleware/jobsAuth');

const app = express();
const APP_VERSION = "1.0.2";

// --- CONFIG ---
const PORT = parseInt(process.env.PORT) || 5021;
const JOBS_DIR = process.env.JOBS_DIR ? path.resolve(process.env.JOBS_DIR) : path.join(__dirname, 'jobs');
const ASSIMP_PATH = process.platform === 'win32' ? 'assimp.exe' : 'assimp';

if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });

// --- MIDDLEWARE ---
app.set('trust proxy', 1);
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        const proto = req.protocol;
        const host = req.headers.host || '';
        const allowedDomain = '3dportal.kustomkraftcabinets.ddns.net';

        // DEBUG LOGGING FOR HEADERS
        console.log(`[DEBUG] Request: ${req.method} ${req.url} | Host: ${host} | Proto: ${proto}`);

        // Security: Ensure all traffic is strictly HTTPS (trust proxy handles X-Forwarded-Proto)
        if (proto !== 'https') return res.status(403).send('Forbidden: HTTPS required.');
        
        // Temporarily relaxed domain check to ensure access works
        if (host !== allowedDomain && !host.startsWith(`${allowedDomain}:`) && host !== 'localhost' && !host.startsWith('localhost:')) {
            console.warn(`[SECURITY] Blocked access from unauthorized host: ${host}`);
            return res.status(403).send(`Forbidden: Host ${host} not allowed.`);
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
            styleSrc: ["'self'"],
            workerSrc: ["'self'", "blob:"],
        }
    },
    hsts: true,
    crossOriginEmbedderPolicy: false
}));

app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/jobs', jobsAuth, express.static(JOBS_DIR));

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
        } catch (err) {
            // ignore
        }
        return null;
    };

    findGlb(jobPath).then(absPath => {
        if (absPath) return res.json({ success: true, url: `/jobs/${path.relative(JOBS_DIR, absPath).replace(/\\/g, '/')}` });
        res.status(404).json({ success: false });
    });
});

// --- CONVERSION ENGINE ---
const conversionQueue = [];
let isConverting = false;

async function cleanDae(filePath) {
    try {
        let content = await fs.promises.readFile(filePath, 'utf8');
        let cleaned = content;
        cleaned = cleaned.replace(/<h>[\s\S]*?<\/h>/g, '');
        cleaned = cleaned.replace(/<ph>/g, '').replace(/<\/ph>/g, '');
        cleaned = cleaned.replace(/\t/g, ' ').replace(/ +/g, ' ');
        cleaned = cleaned.replace(/> /g, '>').replace(/ <\//g, '</');
        if (content !== cleaned) await fs.promises.writeFile(filePath, cleaned, 'utf8');
    } catch (e) { console.error(`!!! [Cleaner] Error: ${e.message}`); }
}

async function processQueue() {
    if (isConverting || conversionQueue.length === 0) return;
    isConverting = true;
    const { filePath } = conversionQueue.shift();
    const dir = path.dirname(filePath);
    const roomName = path.basename(dir);
    const outputGlb = `${roomName.replace(/ /g, '_')}.glb`;
    const finalGlb = path.join(dir, `${roomName}.glb`);
    await cleanDae(filePath);
    execFile(ASSIMP_PATH, ['export', '3D.dae', outputGlb, 'glb2', '-tri', '-gn', '-jiv', '-et', '-emb'], { cwd: dir }, (err, stdout, stderr) => {
        if (err) console.error(`!!! [FAILED] ${roomName}: ${stderr || err.message}`);
        else {
            const genGlb = path.join(dir, outputGlb);
            if (outputGlb !== `${roomName}.glb` && fs.existsSync(genGlb)) {
                try { fs.renameSync(genGlb, finalGlb); } catch(e) { console.error(`!!! [FAILED] Rename ${roomName}: ${e.message}`); }
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
    } catch (e) {
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
        const scan = (dir) => {
            if (!fs.existsSync(dir)) return;
            fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) scan(fullPath);
                else if (entry.name.toLowerCase() === '3d.dae') convertDesign(fullPath, true);
            });
        };
        scan(JOBS_DIR);
    });

    chokidar.watch(JOBS_DIR, {
        ignoreInitial: true,
        ignored: [/(\\|\/)\./, '**/*.glb'],
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
    }).on('all', (event, fp) => {
        const dae = path.join(path.dirname(fp), '3D.dae');
        if (fs.existsSync(dae)) convertDesign(dae);
    });
}

module.exports = app;