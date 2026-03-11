## 2024-05-24 - Path Traversal in API Endpoint
**Vulnerability:** Path traversal in the `/api/job/:code` and `/api/job/:code/:room` endpoints where user input was passed directly into `path.join()`.
**Learning:** `path.join()` normalizes the path but does not prevent going above the base directory. Unhandled errors (like trying to `fs.readdirSync` an invalid directory) can lead to Information Exposure by leaking the stack trace.
**Prevention:** Use `path.resolve()` to get the absolute path and verify it starts with the intended base directory (using `startsWith(safeBase + path.sep)`). Add a global Express error handler to catch unexpected exceptions.
## 2024-05-24 - Host Header Injection and Open Redirect
**Vulnerability:** The application redirected HTTP traffic to HTTPS using `res.redirect(301, \`https://${host}${req.url}\`)`. The `host` was extracted from the `Host` header. The validation only checked if `!host.includes('localhost')`, allowing an attacker to bypass it with `Host: localhost.attacker.com` and trigger an Open Redirect.
**Learning:** Redirecting based on unvalidated or loosely validated Host headers can lead to Open Redirects or Host Header Injection. `includes()` is not a safe way to validate hostnames.
**Prevention:** Never allow HTTP. Instead of redirecting to HTTPS, immediately reject HTTP requests with a `403 Forbidden`. Validate Host headers using strict equality (e.g., `host === 'localhost'`) or explicit port matching (e.g., `host.startsWith('localhost:')`), never `includes()`.
## 2024-05-24 - Rate Limiting API Endpoints
**Vulnerability:** The API endpoints under `/api/` had no rate limiting, making them vulnerable to Denial of Service (DoS) and enumeration attacks.
**Learning:** `express-rate-limit` is a standard way to implement basic rate limiting in Express applications.
**Prevention:** Apply a rate limiter middleware to sensitive endpoints (e.g., `/api/`) with a reasonable limit (e.g., 100 requests per 15 minutes) and a secure error message.

## 2024-05-24 - Path Traversal (Secondary Parameters)
**Vulnerability:** Even if the primary path parameter (`code`) was validated against path traversal, secondary parameters (`room`) used in subsequent path operations (`path.resolve(jobPath, room)`) were still vulnerable if not explicitly validated.
**Learning:** Path traversal validation must be applied to *every* segment of user input used to construct a file path, not just the base directory.
**Prevention:** Resolve the full path including all user inputs (`roomPath`), and verify that it strictly starts with the previously validated base directory for that segment (`jobPath + path.sep`).

## 2024-05-24 - HTTPS Enforcement Bypass
**Vulnerability:** The HTTPS enforcement middleware in `server.js` was checking `req.headers['x-forwarded-proto']` and only blocking the request if the header was present and not equal to 'https' (`proto && proto !== 'https'`). This allowed direct HTTP requests to completely bypass the HTTPS requirement.
**Learning:** Directly inspecting the `x-forwarded-proto` header is error-prone when Express's `trust proxy` is enabled. It fails to account for requests that arrive without the header entirely (e.g., direct HTTP access).
**Prevention:** Rely on Express's `req.protocol` property, which correctly interprets the `X-Forwarded-Proto` header when `app.set('trust proxy', 1)` is used, and enforces strict equality (`req.protocol !== 'https'`) to block all non-HTTPS traffic securely.

## 2024-05-24 - Static File Extension Bypass via URL Encoding
**Vulnerability:** The middleware protecting the `/jobs` directory intended to only allow specific extensions (like `.glb`, `.jpg`). However, it used `path.extname(req.path)` without decoding the URL. Additionally, it explicitly allowed requests with no extension (`!ext`). By URL-encoding the dot (`%2Etxt`), `path.extname` returned an empty string, triggering the `!ext` condition and passing the request to `express.static`, which decoded the URL and served the unauthorized file.
**Learning:** `req.path` in Express is not strictly fully decoded in a way that is safe for direct path parsing if the proxy doesn't decode it. In Express, `express.static` automatically decodes the URI when looking up the file on the OS, meaning any manual security checks prior to `express.static` must also decode the URI. Furthermore, `!ext` is dangerous as an "allow" condition because any failure to parse the extension allows the file to be served.
**Prevention:** Always `decodeURIComponent` the path before performing security checks on the file name or extension. Use strict allowlists, requiring the extension to be present and explicitly in the allowed array rather than allowing empty extensions.
