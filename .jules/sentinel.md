## 2024-05-24 - Path Traversal in API Endpoint
**Vulnerability:** Path traversal in the `/api/job/:code` and `/api/job/:code/:room` endpoints where user input was passed directly into `path.join()`.
**Learning:** `path.join()` normalizes the path but does not prevent going above the base directory. Unhandled errors (like trying to `fs.readdirSync` an invalid directory) can lead to Information Exposure by leaking the stack trace.
**Prevention:** Use `path.resolve()` to get the absolute path and verify it starts with the intended base directory (using `startsWith(safeBase + path.sep)`). Add a global Express error handler to catch unexpected exceptions.
## 2024-05-24 - Host Header Injection and Open Redirect
**Vulnerability:** The application redirected HTTP traffic to HTTPS using `res.redirect(301, \`https://${host}${req.url}\`)`. The `host` was extracted from the `Host` header. The validation only checked if `!host.includes('localhost')`, allowing an attacker to bypass it with `Host: localhost.attacker.com` and trigger an Open Redirect.
**Learning:** Redirecting based on unvalidated or loosely validated Host headers can lead to Open Redirects or Host Header Injection. `includes()` is not a safe way to validate hostnames.
**Prevention:** Never allow HTTP. Instead of redirecting to HTTPS, immediately reject HTTP requests with a `403 Forbidden`. Validate Host headers using strict equality (e.g., `host === 'localhost'`) or explicit port matching (e.g., `host.startsWith('localhost:')`), never `includes()`.
