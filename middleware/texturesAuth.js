const path = require('path');

// Pre-compiled regex for O(1) segment matching.
// Matches "hidden" or "uncategorized" as whole path segments, case-insensitively.
const BLOCKED_SEGMENTS_REGEX = /(^|\/)(hidden|uncategorized)(\/|$)/i;

module.exports = (req, res, next) => {
    let checkPath;
    try {
        // Use posix.normalize to resolve '..' and ensure consistent forward slashes
        // after decoding the URI component.
        checkPath = path.posix.normalize(decodeURIComponent(req.path));
    } catch (e) {
        return res.status(400).send('Bad Request');
    }

    // Performance: Regex test is significantly faster than splitting and iterating
    // over path segments for each request.
    if (BLOCKED_SEGMENTS_REGEX.test(checkPath)) {
        return res.status(403).send('Forbidden');
    }

    next();
};
