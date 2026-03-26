const fs = require('fs');

let fileContent = fs.readFileSync('server.js', 'utf8');

// We need to add an error-handling middleware specifically for the /api/showroom/config route
// or globally for JSON parsing errors. The simplest way is to catch JSON parse errors.
// The tests fail because express.json throws an error on invalid JSON before it reaches the route handler,
// and the global error handler (if any) or default express handler returns 500.

const replacement = `app.post('/api/showroom/config', express.json({ limit: '1mb' }), (err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ success: false, error: 'Invalid config' });
    }
    next();
}, async (req, res) => {`;

fileContent = fileContent.replace(
    `app.post('/api/showroom/config', express.json({ limit: '1mb' }), async (req, res) => {`,
    replacement
);

fs.writeFileSync('server.js', fileContent);
console.log('Patched server.js');
