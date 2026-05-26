const path = require('path');

module.exports = (req, res, next) => {
    let checkPath = req.path;
    try {
        checkPath = decodeURIComponent(req.path);
    } catch (e) {
        return res.status(400).send('Bad Request');
    }

    // Normalize path to resolve .. and convert \ to /
    checkPath = path.posix.normalize(checkPath.replace(/\\/g, '/'));

    // Split the path and check if it contains Hidden or Uncategorized
    const segments = checkPath.split('/').filter(Boolean);

    // Check if any segment is "Hidden" or "Uncategorized"
    if (segments.some(segment => {
        const lower = segment.toLowerCase();
        return lower === 'hidden' || lower === 'uncategorized';
    })) {
        return res.status(403).send('Forbidden');
    }

    next();
};
