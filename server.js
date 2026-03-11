const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const chokidar = require('chokidar');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const APP_VERSION = "1.1.5-DEBUG-HEADERS";

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
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            scriptSrcAttr: ["'unsafe-inline'"], 
            connectSrc: ["'self'", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            workerSrc: ["'self'", "blob:"],
        }
    },
    hsts: true,
    crossOriginEmbedderPolicy: false
}));

app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/jobs', (req, res, next) => {
    try {
        const decodedPath = decodeURIComponent(req.path);
        const ext = path.extname(decodedPath).toLowerCase();
        // Security: Prevent serving unauthorized file types or files without extensions by explicitly requiring allowed extensions.
        if (['.glb', '.jpg', '.png', '.jpeg'].includes(ext)) return next();
        res.status(403).send('Forbidden');
    } catch (e) {
        res.status(400).send('Bad Request');
    }
}, express.static(JOBS_DIR));

// --- API ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    message: { success: false, error: 'Too many requests, please try again later.' }
});

app.use('/api/', apiLimiter);

app.get('/api/job/:code', (req, res) => {
    const code = req.params.code;
    const safeBase = path.resolve(JOBS_DIR);
    const jobPath = path.resolve(safeBase, path.join('.', code));
    // Security: Prevent path traversal
    if (!jobPath.startsWith(safeBase + path.sep)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (!fs.existsSync(jobPath)) return res.status(404).json({ success: false });
    const rooms = [];
    const findGlbs = (dir) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) findGlbs(fullPath);
            else if (entry.name.toLowerCase().endsWith('.glb')) rooms.push(path.basename(entry.name, '.glb'));
        });
    };
    findGlbs(jobPath);
    res.json({ success: true, rooms: [...new Set(rooms)] });
});

app.get('/api/job/:code/:room', (req, res) => {
    const { code, room } = req.params;
    const safeBase = path.resolve(JOBS_DIR);
    const jobPath = path.resolve(safeBase, path.join('.', code));
    const roomPath = path.resolve(jobPath, path.join('.', room));

    // Security: Prevent path traversal for both code and room
    if (!jobPath.startsWith(safeBase + path.sep) || !roomPath.startsWith(jobPath + path.sep)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const findGlb = (dir) => {
        let found = null;
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) { let r = findGlb(fullPath); if (r) found = r; }
            else if (entry.name.toLowerCase() === `${room.toLowerCase()}.glb`) found = fullPath;
        });
        return found;
    };
    const absPath = findGlb(jobPath);
    if (absPath) return res.json({ success: true, url: `/jobs/${path.relative(JOBS_DIR, absPath).replace(/\\/g, '/')}` });
    res.status(404).json({ success: false });
});

// --- CONVERSION ENGINE ---
const conversionQueue = [];
let isConverting = false;

function cleanDae(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let cleaned = content;
        cleaned = cleaned.replace(/<h>[\s\S]*?<\/h>/g, '');
        cleaned = cleaned.replace(/<ph>/g, '').replace(/<\/ph>/g, '');
        cleaned = cleaned.replace(/\t/g, ' ').replace(/ +/g, ' ');
        cleaned = cleaned.replace(/> /g, '>').replace(/ <\//g, '</');
        if (content !== cleaned) fs.writeFileSync(filePath, cleaned, 'utf8');
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
    cleanDae(filePath);
    execFile(ASSIMP_PATH, ['export', '3D.dae', outputGlb, 'glb2', '-tri', '-gn', '-jiv', '-et', '-emb'], { cwd: dir }, (err, stdout, stderr) => {
        if (err) console.error(`!!! [FAILED] ${roomName}: ${stderr || err.message}`);
        else {
            const genGlb = path.join(dir, outputGlb);
            if (outputGlb !== `${roomName}.glb` && fs.existsSync(genGlb)) {
                try { fs.renameSync(genGlb, finalGlb); } catch(e) {}
            }
            console.log(`SUCCESS: ${roomName} is live.`);
        }
        isConverting = false;
        processQueue();
    });
}

const pendingTimers = new Map();
function convertDesign(filePath, skipTimer = false) {
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