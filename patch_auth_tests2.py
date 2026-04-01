import re

auth_file = 'middleware/jobsAuth.js'

with open(auth_file, 'r') as f:
    content = f.read()

old_logic = """module.exports = (req, res, next) => {
    try {
        const decodedPath = decodeURIComponent(req.path);
        const ext = path.extname(decodedPath).toLowerCase();
        // Security: Prevent serving unauthorized file types or files without extensions by explicitly requiring allowed extensions.
        if (ALLOWED_EXTENSIONS.has(ext)) return next();
        res.status(403).send('Forbidden');
    } catch (e) {
        res.status(400).send('Bad Request');
    }
};"""

new_logic = """module.exports = (req, res, next) => {
    try {
        const decodedPath = decodeURIComponent(req.path);
        const ext = path.extname(decodedPath).toLowerCase();
        // Security: Prevent serving unauthorized file types or files without extensions by explicitly requiring allowed extensions.
        if (ALLOWED_EXTENSIONS.has(ext)) return next();
        res.status(403).send('Forbidden');
    } catch (e) {
        res.status(400).send('Bad Request');
    }
};"""

content = content.replace(old_logic, new_logic)

with open(auth_file, 'w') as f:
    f.write(content)
