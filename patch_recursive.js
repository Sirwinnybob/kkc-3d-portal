const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

const oldCode = `// GET /api/showroom/staging - List staged GLB files
app.get('/api/showroom/staging', async (req, res) => {
    try {
        const files = await fs.promises.readdir(STAGING_DIR);
        const glbs = files
            .filter(f => f.toLowerCase().endsWith('.glb'))
            .map(f => {
                const baseName = path.basename(f, '.glb');
                const tagsFile = path.join(STAGING_DIR, \`\${baseName}.tags.json\`);
                return { file: f, name: baseName.replace(/_/g, ' '), tagged: fs.existsSync(tagsFile) };
            });
        res.json({ success: true, files: glbs });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to list staging files' });
    }
});`;

const newCode = `// GET /api/showroom/staging - List staged GLB files
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
                    const relativePath = require('path').relative(rootDir, fullPath).replace(/\\\\/g, '/');
                    const baseName = require('path').basename(entry.name, '.glb');
                    const tagsFile = require('path').join(dir, \`\${baseName}.tags.json\`);
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
});`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('server.js', code);
