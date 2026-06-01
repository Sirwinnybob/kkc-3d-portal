const path = require('path');

// Pre-compiled regex for case-insensitive matching of "Hidden" or "Uncategorized" as path segments.
// This is significantly faster than splitting the path and iterating over segments.
const AUTH_RESTRICTED_SEGMENTS_REGEX = /(^|\/)(hidden|uncategorized)(\/|$)/i;

module.exports = (req, res, next) => {
    let checkPath = req.path;
    try {
        checkPath = decodeURIComponent(req.path);
    } catch (e) {
        return res.status(400).send('Bad Request');
    }

    // Check if the path contains "Hidden" or "Uncategorized" as full segments
    if (AUTH_RESTRICTED_SEGMENTS_REGEX.test(checkPath)) {
        return res.status(403).send('Forbidden');
    }

    next();
};
