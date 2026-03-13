## 2024-05-18 - Input Validation on Predictable APIs
**Vulnerability:** The API endpoints (`/api/job/:code`) used a direct directory lookup parameter without validating its length or format. Because job codes could be predictable (e.g. sequentially generated numbers), attackers could easily enumerate and brute-force the API to find valid jobs or crash the process with excessively large lookup strings.
**Learning:** Even internal API endpoints guarded by restrictive file reading logic must validate route parameter formats.
**Prevention:** Always use regex-based input validation (`/^[a-zA-Z0-9\-_]+$/`) and reasonable length constraints (e.g. `length <= 50`) on ID/code route parameters before attempting any backend path resolution.

## 2024-05-18 - Reflected XSS in Host Validation Error
**Vulnerability:** The Express server reflected the user-controlled `Host` header back to the user within a `text/html` error response when domain validation failed. Since the `Host` header was unescaped, it allowed an attacker to inject arbitrary HTML or JavaScript, resulting in a Cross-Site Scripting (XSS) vulnerability.
**Learning:** Even low-level network components like header validation must sanitize user input or avoid reflecting it directly in HTML error responses.
**Prevention:** Always respond with generic, static error messages when rejecting requests based on untrusted headers, or ensure all reflected content is properly escaped.
