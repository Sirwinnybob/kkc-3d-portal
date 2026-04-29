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

    // Check if any segment is "Hidden" or "Uncategorized"
    // Exception: Allow access to Hidden/LOD/ for thumbnails
    if (segments.some((segment, index) => {
        const lower = segment.toLowerCase();
        if (lower === 'uncategorized') return true;
        if (lower === 'hidden') {
            const nextSegment = segments[index + 1] ? segments[index + 1].toLowerCase() : null;
            if (nextSegment === 'lod') return false; // Allow Hidden/LOD
            return true;
        }
        return false;
    })) {
        return res.status(403).send('Forbidden');
    }

    next();
};
