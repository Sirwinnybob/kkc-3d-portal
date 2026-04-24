const path = require('path');

module.exports = (req, res, next) => {
    let checkPath = req.path;
    try {
        checkPath = decodeURIComponent(req.path);
    } catch (e) {
        return res.status(400).send('Bad Request');
    }

    // Split the path and check if it contains Hidden or Uncategorized
    const segments = checkPath.split('/').filter(Boolean);

    // Allow Hidden/LOD for thumbnails, but block direct access to Hidden and Uncategorized
    for (let i = 0; i < segments.length; i++) {
        const lower = segments[i].toLowerCase();
        if (lower === 'uncategorized') return res.status(403).send('Forbidden');
        if (lower === 'hidden') {
            const next = segments[i + 1] ? segments[i + 1].toLowerCase() : '';
            if (next !== 'lod') {
                return res.status(403).send('Forbidden');
            }
            i++; // Skip 'lod' as it is authorized
        }
    }

    next();
};
