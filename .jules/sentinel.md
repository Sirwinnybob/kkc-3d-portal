## 2024-05-18 - Input Validation on Predictable APIs
**Vulnerability:** The API endpoints (`/api/job/:code`) used a direct directory lookup parameter without validating its length or format. Because job codes could be predictable (e.g. sequentially generated numbers), attackers could easily enumerate and brute-force the API to find valid jobs or crash the process with excessively large lookup strings.
**Learning:** Even internal API endpoints guarded by restrictive file reading logic must validate route parameter formats.
**Prevention:** Always use regex-based input validation (`/^[a-zA-Z0-9\-_]+$/`) and reasonable length constraints (e.g. `length <= 50`) on ID/code route parameters before attempting any backend path resolution.

## 2024-05-18 - Reflected XSS in Host Validation Error
**Vulnerability:** The Express server reflected the user-controlled `Host` header back to the user within a `text/html` error response when domain validation failed. Since the `Host` header was unescaped, it allowed an attacker to inject arbitrary HTML or JavaScript, resulting in a Cross-Site Scripting (XSS) vulnerability.
**Learning:** Even low-level network components like header validation must sanitize user input or avoid reflecting it directly in HTML error responses.
**Prevention:** Always respond with generic, static error messages when rejecting requests based on untrusted headers, or ensure all reflected content is properly escaped.
## 2024-05-18 - Log Injection (CWE-117) via Unsanitized Headers
**Vulnerability:** The application was vulnerable to Log Injection because it logged the unescaped, user-controlled `Host` header using `console.warn`. An attacker could inject newline characters (`\r\n`) into the `Host` header to spoof log entries, potentially covering up malicious activities or triggering false alerts in monitoring systems.
**Learning:** Untrusted input from network headers can be used to exploit logging mechanisms even if it is not reflected back to the user or used in backend logic.
**Prevention:** Always sanitize untrusted input before logging by stripping or escaping control characters like newlines (`replace(/[\r\n]/g, "")`).
## 2024-05-18 - Missing Input Validation on Room API Parameter
**Vulnerability:** The `/api/job/:code/:room` endpoint properly validated the `code` parameter but omitted the same regex and length validation checks for the `room` parameter. While a path traversal validation existed (`if (relRoom.startsWith('..'))`), an attacker could still supply abnormally long strings or unexpected formats.
**Learning:** Input validation must be consistently applied to all URL parameters. Relying only on backend path resolution logic to catch malicious inputs is incomplete defense-in-depth and leaves the application open to potential ReDoS or uncontrolled resource consumption.
**Prevention:** Always validate every segment of user input at the route-entry level, using both length restrictions (`room.length > 100`) and format enforcing regexes (`/^[a-zA-Z0-9\-_ ]+$/`).
## 2024-03-27 - [Fix Weak Random Number Generation]
**Vulnerability:** Weak random number generation using `Math.random()` to generate secure 5-digit PINs for showroom configs.
**Learning:** `Math.random()` is predictable and not cryptographically secure, which means malicious actors could potentially guess PINs if they determine the seed or PRNG state. This is especially risky for short, numeric pins (like 5 digits).
**Prevention:** Always use cryptographically secure random number generators (CSPRNG), such as `crypto.randomInt()`, when generating tokens, keys, passwords, or PINs.
