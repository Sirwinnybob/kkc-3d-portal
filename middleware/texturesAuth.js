const path = require('path');

// Pre-compiled regex for O(1) matching against restricted directories.
// Matches "hidden" or "uncategorized" as whole path segments.
const TEXTURE_RESTRICTED_REGEX = /(^|[\\\/])(hidden|uncategorized)([\\\/]|$)/i;

module.exports = (req, res, next) => {
    try {
        const decodedPath = decodeURIComponent(req.path);
        // Normalize path to resolve '..' and ensure consistent separators,
        // preventing directory traversal bypasses of the regex check.
        const normalizedPath = path.normalize(decodedPath);

        // Exception: allow access to low-resolution thumbnails in Hidden/LOD/
        // These are safe to serve publicly for the catalog/preview views.
        if (normalizedPath.startsWith('/Hidden/LOD/') || normalizedPath.startsWith('\\Hidden\\LOD\\')) {
            return next();
        }

        if (TEXTURE_RESTRICTED_REGEX.test(normalizedPath)) {
            return res.status(403).send('Forbidden');
        }

        next();
    } catch (e) {
        return res.status(400).send('Bad Request');
    }
};
