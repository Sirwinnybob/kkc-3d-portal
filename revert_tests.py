# Tests were relying on the specific error code `400 Bad Request`
# for malformed queries (e.g. % symbol). I changed the logic to catch it
# and fall back to extension check.
# But wait, if it falls back and is a valid extension, it might return 404 or 403.
# The tests expected 400.
# Since my plan modified `jobsAuth.js` to catch the error, let me just undo the try/catch in jobsAuth, as the actual issue was three.js `URLModifier`! We don't need to swallow malformed URIs.
import re

auth_file = 'middleware/jobsAuth.js'

with open(auth_file, 'r') as f:
    content = f.read()

old_logic = """module.exports = (req, res, next) => {
    let checkPath = req.path;
    try {
        checkPath = decodeURIComponent(req.path);
    } catch (e) {
        // Fallback to raw path if decoding fails (e.g. malformed URI with unescaped %)
    }

    const ext = path.extname(checkPath).toLowerCase();
    // Security: Prevent serving unauthorized file types or files without extensions by explicitly requiring allowed extensions.
    if (ALLOWED_EXTENSIONS.has(ext)) return next();
    res.status(403).send('Forbidden');
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
