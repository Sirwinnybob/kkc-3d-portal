# Security Audit TO-DO

Generated 2026-08-05 from Codex Security scan (scan ID: 20d4ad24-1f47-48c2-97be-5b7801c1c6e6)

## P2 — Medium Severity

### [ ] protobufjs code injection in transitive deps (CWE-94, CWE-1321)

protobufjs 8.0-8.6.5 (transitive via @gltf-transform) has code injection via bytes field defaults in generated toObject code (GHSA-66ff-xgx4-vchm) and prototype pollution code generation gadgets (GHSA-75px-5xx7-5xc7, CVSS 8.1).

**Fix**: Run `npm audit fix` or update @gltf-transform to a version using protobufjs >=8.7.0. Verify GLB processing pipeline after update.

**File**: package.json (line 19, @gltf-transform deps)

---

## P3 — Low Severity

### [ ] express-rate-limit rate limit bypass via ip-address (CWE-20, CWE-918)

express-rate-limit depends on ip-address <=10.3.0 which has leading-zero octet SSRF/inconsistency (GHSA-mwp4-54f8-5fhr). Attackers may bypass rate limits via octal IP encoding on /api/ endpoints, config creation, and config retrieval.

**Fix**: Run `npm audit fix` to update ip-address. If express-rate-limit does not update its dependency, pin a patched ip-address version or switch rate limiter.

**File**: server.js (line 136, rate limit configs)

### [ ] sharp inherits libvips vulnerabilities (CWE-1395)

sharp 0.34.5 inherits CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 via libvips (GHSA-f88m-g3jw-g9cj, HIGH). Affects texture pHash computation and LOD generation during catalog indexing.

**Fix**: Run `npm install sharp@latest` (0.35.3+). Major version bump — test computePhash and LOD generation after upgrade.

**File**: server.js (line 19, sharp import)

### [ ] adminAuth timing side channel leaks credential length (CWE-208)

crypto.timingSafeEqual is skipped when credential buffer lengths differ, leaking ADMIN_USER and ADMIN_PASS length via response timing. An attacker can determine exact credential lengths with ~256 requests per character.

**Fix**: Pad the shorter buffer to match longer buffer length and always call timingSafeEqual regardless of length mismatch.

**File**: middleware/adminAuth.js (lines 17-26)

---

## Quick Wins

Run these commands to fix the dependency issues immediately:

```
npm audit fix
npm install sharp@latest
```

Note: sharp is a semver-major upgrade (0.34 → 0.35) and requires testing the texture pipeline afterward.

## Full Report

[report.md](C:\Users\chadc\AppData\Local\Temp\codex-security-scans-RMyckP\KKC_Portal\1f63dbb1fb6f3cba6c46edf485126e98bbd3875e_20260805T190219Z_0jfs_2q2\report.md)