## 2024-05-24 - [CSP Bypass via Permissive CDN]
**Vulnerability:** The Content Security Policy (CSP) allowed the entirety of `https://unpkg.com` in the `scriptSrc` and `connectSrc` directives.
**Learning:** While CDNs like unpkg are convenient for loading dependencies, whitelisting the entire domain is a critical vulnerability. Any attacker could upload a malicious package to NPM and execute it by injecting a script tag like `<script src="https://unpkg.com/malicious-package/script.js"></script>`, entirely bypassing the CSP.
**Prevention:** Always restrict CDN domains in CSP to the exact package and version required (e.g., `https://unpkg.com/three@0.160.0/`) to strictly limit executable sources to known, trusted code.
