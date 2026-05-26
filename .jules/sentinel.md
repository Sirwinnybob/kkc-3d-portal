## 2024-05-26 - Middleware Path Normalization & Static File Auth Bypass
**Vulnerability:**
1. Path Traversal bypass in `texturesAuth.js` and `jobsAuth.js` via unnormalized paths (e.g., using `\` or `..`).
2. Authentication bypass for static admin files (like `/admin/tagger.html`) due to the general `express.static('public')` catch-all middleware overriding the intended protection, as the `/admin` path was implicitly served without the `adminAuth` middleware.
**Learning:**
1. `req.path` is decoded but retains unnormalized characters in Express. Attackers can leverage Windows-style backslashes or relative path segments (`..`) to bypass simple string matching (`split('/')`).
2. Express static middleware implicitly serves everything in its root. Relying solely on API route protection (`/api/...`) leaves static physical assets vulnerable if they share the same conceptual path but aren't explicitly protected by an auth middleware mounted before the catch-all.
**Prevention:**
1. Always apply `path.posix.normalize(checkPath.replace(/\\/g, '/'))` on `req.path` before validating access controls or matching route segments.
2. When securing static file directories (like `/admin`), mount explicit authentication middleware on those specific static paths ahead of the general `express.static` catch-all.
