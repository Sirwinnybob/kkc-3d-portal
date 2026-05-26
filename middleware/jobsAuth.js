const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.glb', '.jpg', '.png', '.jpeg', '.obj', '.mtl', '.bmp', '.tga', '.tif', '.tiff', '.webp']);

module.exports = (req, res, next) => {
    let checkPath = req.path;
    try {
        checkPath = decodeURIComponent(req.path);
    } catch (e) {
        return res.status(400).send('Bad Request');
    }

    // Normalize path to resolve .. and convert \ to /
    checkPath = path.posix.normalize(checkPath.replace(/\\/g, '/'));

    const ext = path.extname(checkPath).toLowerCase();
    // Security: Prevent serving unauthorized file types or files without extensions by explicitly requiring allowed extensions.
    if (ALLOWED_EXTENSIONS.has(ext)) return next();
    res.status(403).send('Forbidden');
};
