import re

auth_file = 'middleware/jobsAuth.js'

with open(auth_file, 'r') as f:
    content = f.read()

# Add more extensions
content = content.replace("['.glb', '.jpg', '.png', '.jpeg', '.obj', '.mtl']", "['.glb', '.jpg', '.png', '.jpeg', '.obj', '.mtl', '.bmp', '.tga', '.tif', '.tiff', '.webp']")

# Update the try/catch logic to handle malformed URIs
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

content = content.replace(old_logic, new_logic)

with open(auth_file, 'w') as f:
    f.write(content)
