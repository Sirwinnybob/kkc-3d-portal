const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Replace /api/showroom/staging/meshes/:file
code = code.replace(
    `app.get('/api/showroom/staging/meshes/:file', async (req, res) => {
    const safeFile = path.basename(req.params.file);
    if (!/^[a-zA-Z0-9\\-_ ]+\\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);`,
    `app.get('/api/showroom/staging/meshes/:file', async (req, res) => {
    const safeFile = req.params.file;
    if (!/^[a-zA-Z0-9\\-_ \\/]+\\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);`
);

// Replace /api/showroom/staging/parse/:file
code = code.replace(
    `app.post('/api/showroom/staging/parse/:file', async (req, res) => {
    const safeFile = path.basename(req.params.file);
    if (!/^[a-zA-Z0-9\\-_ ]+\\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);`,
    `app.post('/api/showroom/staging/parse/:file', async (req, res) => {
    const safeFile = req.params.file;
    if (!/^[a-zA-Z0-9\\-_ \\/]+\\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);`
);

// Replace /api/showroom/staging/tags/:file (POST)
code = code.replace(
    `app.post('/api/showroom/staging/tags/:file', express.json({ limit: '10mb' }), async (req, res) => {
    const safeFile = path.basename(req.params.file, '.glb');
    if (!/^[a-zA-Z0-9\\-_ ]+$/.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file name' });

    const tagsPath = path.join(STAGING_DIR, \`\${safeFile}.tags.json\`);`,
    `app.post('/api/showroom/staging/tags/:file', express.json({ limit: '10mb' }), async (req, res) => {
    const safeFile = req.params.file.replace(/\\.glb$/i, '');
    if (!/^[a-zA-Z0-9\\-_ \\/]+$/.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file name' });

    const tagsPath = path.join(STAGING_DIR, \`\${safeFile}.tags.json\`);
    const rel = path.relative(STAGING_DIR, tagsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });`
);

// Replace /api/showroom/staging/tags/:file (GET)
code = code.replace(
    `app.get('/api/showroom/staging/tags/:file', async (req, res) => {
    const safeFile = path.basename(req.params.file, '.glb').replace(/\\.tags$/, '');
    const tagsPath = path.join(STAGING_DIR, \`\${safeFile}.tags.json\`);`,
    `app.get('/api/showroom/staging/tags/:file', async (req, res) => {
    const safeFile = req.params.file.replace(/\\.glb$/i, '').replace(/\\.tags$/i, '');
    const tagsPath = path.join(STAGING_DIR, \`\${safeFile}.tags.json\`);
    const rel = path.relative(STAGING_DIR, tagsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.status(403).json({ success: false, error: 'Forbidden' });`
);

// Replace /api/showroom/staging/split/:file
code = code.replace(
    `app.post('/api/showroom/staging/split/:file', express.json({ limit: '10mb' }), async (req, res) => {
    const safeFile = path.basename(req.params.file);
    if (!/^[a-zA-Z0-9\\-_ ]+\\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);`,
    `app.post('/api/showroom/staging/split/:file', express.json({ limit: '10mb' }), async (req, res) => {
    const safeFile = req.params.file;
    if (!/^[a-zA-Z0-9\\-_ \\/]+\\.glb$/i.test(safeFile)) return res.status(400).json({ success: false, error: 'Invalid file' });

    const filePath = path.join(STAGING_DIR, safeFile);`
);

fs.writeFileSync('server.js', code);
