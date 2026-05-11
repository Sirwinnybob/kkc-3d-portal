## 2024-05-24 - [CSP Bypass via Permissive CDN]
**Vulnerability:** The Content Security Policy (CSP) allowed the entirety of `https://unpkg.com` in the `scriptSrc` and `connectSrc` directives.
**Learning:** While CDNs like unpkg are convenient for loading dependencies, whitelisting the entire domain is a critical vulnerability. Any attacker could upload a malicious package to NPM and execute it by injecting a script tag like `<script src="https://unpkg.com/malicious-package/script.js"></script>`, entirely bypassing the CSP.
**Prevention:** Always restrict CDN domains in CSP to the exact package and version required (e.g., `https://unpkg.com/three@0.160.0/`) to strictly limit executable sources to known, trusted code.

## 2024-10-24 - [Information Disclosure via Directory Traversal]
**Vulnerability:** The `/api/textures/:category` endpoint allowed users to view the contents of system-level hidden directories (`Hidden`, `Uncategorized`) due to lack of strict parameter validation.
**Learning:** Checking for `..` is not always enough to prevent directory traversal or information disclosure if specific directories at the target level are meant to be private. Path traversal protections must be coupled with strict allow/deny list checks for the target entities.
**Prevention:** Always explicitly validate dynamic path parameters against a known-good list of allowed entities, or at least explicitly block known system/private entities using a case-insensitive check.

## 2024-10-25 - [DoS via Unhandled Promise Rejection in Express]
**Vulnerability:** Express routing endpoints using wildcard parameters (`{*path}`) alongside `path-to-regexp` v8 return arrays instead of strings. Passing these arrays directly to string-only functions like `path.join` or `path.basename` inside an un-awaited `async` route handler throws a synchronous `TypeError`, leading to an Unhandled Promise Rejection and crashing the entire Node.js application (DoS).
**Learning:** In modern Node.js environments (v15+), unhandled promise rejections are fatal. Express 4 does not automatically catch synchronous errors in `async` route handlers. Therefore, parameter types must be explicitly validated or normalized before being passed to strict native APIs.
**Prevention:** Always validate parameter types in async routes. Specifically, check `if (!path)` and handle arrays `if (Array.isArray(path)) path = path.join('/')` when working with wildcard paths in Express.

## 2024-11-05 - [Brute-force Vulnerability on Short PINs]
**Vulnerability:** The `/api/showroom/config/:pin` endpoint lacked specific rate limiting, allowing an attacker to brute-force the 5-digit (100k combinations) PINs to gain unauthorized access to saved showroom configurations.
**Learning:** Short, numeric identifiers like PINs are highly susceptible to brute-force attacks if not protected by aggressive rate limiting. Generic API limiters (e.g., 100 req/15 min) are often too permissive for such small search spaces.
**Prevention:** Implement strict, endpoint-specific rate limiting (e.g., 10 req/15 min) for any resource identified by a short, guessable secret. This forces the attack time to exceed the practical window of exploitation.
## 2026-04-18 - Disable X-Powered-By header\n**Vulnerability:** The application was leaking the backend technology stack (Express) in the `X-Powered-By` HTTP header.\n**Learning:** By default, Express sets the `X-Powered-By: Express` header in every response. This information can be used by attackers to target specific vulnerabilities associated with the technology stack.\n**Prevention:** Call `app.disable('x-powered-by')` on the Express application instance immediately after initialization to prevent this header from being sent.

## 2024-11-20 - [Information Disclosure via Static File Serving]
**Vulnerability:** The `/textures` static file route was serving all files in the `textures/` directory, including those in `Hidden` and `Uncategorized` folders, bypassing the checks in the `/api/textures/:category` endpoint.
**Learning:** Security checks in API endpoints do not protect static file routes serving the same underlying directories. The static middleware must have its own equivalent security checks, or the sensitive data must be moved out of the publicly served static directory tree.
**Prevention:** Implement a middleware specifically for the static route to block access to system directories (`Hidden`, `Uncategorized`), ensuring that static file serving matches the security policy of the API endpoints.

## 2026-05-11 - [Unauthorized Access via Static Directory Serving]
**Vulnerability:** The `/admin` route in `server.js` was serving static files (including `tagger.html`) using `express.static('public')` before any authentication middleware was applied to that path. This allowed unauthenticated users to access the Showroom Tagger tool.
**Learning:** In Express.js applications, static file routes are handled sequentially. If `express.static()` for a directory containing sensitive/admin files is mounted *before* or *without* specific authentication middleware for that subset of files, the static middleware will serve them to anyone. API endpoint protection does not implicitly protect static files in similarly named paths.
**Prevention:** Always mount authentication middleware explicitly on sensitive directory paths (e.g., `app.use('/admin', adminAuth)`) *before* applying broad static file serving middleware (e.g., `express.static('public')`) that includes those sensitive subdirectories.
