## 2024-05-24 - [CSP Bypass via Permissive CDN]
**Vulnerability:** The Content Security Policy (CSP) allowed the entirety of `https://unpkg.com` in the `scriptSrc` and `connectSrc` directives.
**Learning:** While CDNs like unpkg are convenient for loading dependencies, whitelisting the entire domain is a critical vulnerability. Any attacker could upload a malicious package to NPM and execute it by injecting a script tag like `<script src="https://unpkg.com/malicious-package/script.js"></script>`, entirely bypassing the CSP.
**Prevention:** Always restrict CDN domains in CSP to the exact package and version required (e.g., `https://unpkg.com/three@0.160.0/`) to strictly limit executable sources to known, trusted code.

## 2024-10-24 - [Information Disclosure via Directory Traversal]
**Vulnerability:** The `/api/textures/:category` endpoint allowed users to view the contents of system-level hidden directories (`Hidden`, `Uncategorized`) due to lack of strict parameter validation.
**Learning:** Checking for `..` is not always enough to prevent directory traversal or information disclosure if specific directories at the target level are meant to be private. Path traversal protections must be coupled with strict allow/deny list checks for the target entities.
**Prevention:** Always explicitly validate dynamic path parameters against a known-good list of allowed entities, or at least explicitly block known system/private entities using a case-insensitive check.
