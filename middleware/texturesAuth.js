const FORBIDDEN_RE = /(^|[\\\/])(hidden|uncategorized)([\\\/]|$)/i;
const LOD_EXCEPTION_RE = /(^|[\\\/])hidden[\\\/]lod([\\\/]|$)/i;

/**
 * Textures Authorization Middleware
 * Optimized with pre-compiled regex for O(1) segment matching.
 * Blocks "Hidden" and "Uncategorized" directories while allowing "Hidden/LOD/" thumbnails.
 */
module.exports = (req, res, next) => {
    let checkPath;
    try {
        checkPath = decodeURIComponent(req.path);
    } catch (e) {
        return res.status(400).send('Bad Request');
    }

    // Fast segment matching using regex instead of split/some
    if (FORBIDDEN_RE.test(checkPath)) {
        // Exception: Allow serving low-resolution thumbnails from Hidden/LOD/
        // but never allow Uncategorized/ even if it somehow contains Hidden/LOD/
        const isUncategorized = /(^|[\\\/])uncategorized([\\\/]|$)/i.test(checkPath);
        if (isUncategorized || !LOD_EXCEPTION_RE.test(checkPath)) {
            return res.status(403).send('Forbidden');
        }
    }

    next();
};
