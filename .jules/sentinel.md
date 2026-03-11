## 2024-05-24 - Path Traversal in API Endpoint
**Vulnerability:** Path traversal in the `/api/job/:code` and `/api/job/:code/:room` endpoints where user input was passed directly into `path.join()`.
**Learning:** `path.join()` normalizes the path but does not prevent going above the base directory. Unhandled errors (like trying to `fs.readdirSync` an invalid directory) can lead to Information Exposure by leaking the stack trace.
**Prevention:** Use `path.resolve()` to get the absolute path and verify it starts with the intended base directory (using `startsWith(safeBase + path.sep)`). Add a global Express error handler to catch unexpected exceptions.
