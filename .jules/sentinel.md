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
