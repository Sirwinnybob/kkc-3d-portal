const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.glb', '.jpg', '.png', '.jpeg', '.obj', '.mtl', '.bmp', '.tga', '.tif', '.tiff', '.webp']);

module.exports = (req, res, next) => {
    try {
        const decodedPath = decodeURIComponent(req.path);
        const ext = path.extname(decodedPath).toLowerCase();
        // Security: Prevent serving unauthorized file types or files without extensions by explicitly requiring allowed extensions.
        if (ALLOWED_EXTENSIONS.has(ext)) return next();
        res.status(403).send('Forbidden');
    } catch (e) {
        res.status(400).send('Bad Request');
    }
};
